"""Public HTTP(S), pinned DNS, redirect revalidation and conservative request budgets."""
from __future__ import annotations
import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit, urljoin, parse_qsl, urlencode


class SourceError(Exception):
    def __init__(self, status, stage, reason):
        super().__init__(reason)
        self.status, self.stage, self.reason = status, stage, reason


def canonical_url(url: str) -> str:
    try:
        p = urlsplit(url)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password or p.port not in (None, 80, 443):
            raise ValueError()
        if any(ord(c) < 32 or c == '\\' for c in url) or len(url) > 4096:
            raise ValueError()
        if p.hostname.endswith('.'):
            raise ValueError()
        query = [(k,v) for k,v in parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith(('utm_',)) and k.lower() not in ('spm','from','ref')]
        return urlunsplit((p.scheme, p.netloc.lower(), p.path or '/', urlencode(query), ''))
    except (ValueError, TypeError):
        raise SourceError('unsupported', 'url', 'invalid_public_url')


def public_addresses(host: str, port: int) -> list[str]:
    if host.lower() in ('localhost', 'metadata.google.internal') or host.lower().endswith(('.local','.localhost','.internal')):
        raise SourceError('blocked', 'dns', 'non_public_destination')
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise SourceError('unreachable', 'dns', 'dns_failed')
    ips = list(dict.fromkeys(a[4][0] for a in answers))
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise SourceError('blocked', 'dns', 'non_public_destination')
    return ips


class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self.ip = ip

    def connect(self):
        self.sock = socket.create_connection((self.ip, self.port), self.timeout)


class _PinnedHTTPS(_PinnedHTTP):
    def connect(self):
        super().connect()
        self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)


@dataclass
class FetchResult:
    url: str
    body: bytes
    content_type: str
    elapsed_ms: int


class PublicFetcher:
    def __init__(self, deadline_seconds=150, max_requests=22, max_bytes=18_000_000, timeout=10, domain_interval=0.8):
        self.deadline = time.monotonic() + deadline_seconds
        self.max_requests, self.max_bytes, self.timeout = max_requests, max_bytes, timeout
        self.domain_interval, self.requests, self.last_domain = domain_interval, 0, {}

    def remaining(self):
        return max(0, self.deadline - time.monotonic())

    def fetch(self, url: str) -> FetchResult:
        start = time.monotonic()
        url = canonical_url(url)
        for redirect in range(5):
            if self.requests >= self.max_requests or self.remaining() < 0.2:
                raise SourceError('budget_exhausted', 'request', 'request_or_time_budget')
            p = urlsplit(url)
            host, port = p.hostname, p.port or (443 if p.scheme == 'https' else 80)
            wait = self.domain_interval - (time.monotonic() - self.last_domain.get(host, 0))
            if wait > 0:
                if wait >= self.remaining():
                    raise SourceError('budget_exhausted', 'rate_limit', 'time_budget')
                time.sleep(wait)
            ips = public_addresses(host, port)
            timeout = min(self.timeout, self.remaining())
            if timeout <= 0:
                raise SourceError('budget_exhausted', 'dns', 'time_budget')
            connection = (_PinnedHTTPS if p.scheme == 'https' else _PinnedHTTP)(host, port, ips[0], timeout)
            self.requests += 1
            self.last_domain[host] = time.monotonic()
            try:
                connection.request('GET', urlunsplit(('', '', p.path or '/', p.query, '')),
                    headers={'User-Agent':'XRayResearch/2.0 (public evidence; no login)', 'Accept':'text/html,application/pdf,text/plain', 'Accept-Encoding':'identity', 'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.5'})
                response = connection.getresponse()
                if response.status in (301,302,303,307,308):
                    if redirect == 4 or not response.getheader('Location'):
                        raise SourceError('blocked', 'redirect', 'redirect_limit')
                    url = canonical_url(urljoin(url, response.getheader('Location')))
                    continue
                if response.status in (401,403,429,451):
                    raise SourceError('login_required' if response.status == 401 else 'blocked', 'http', 'http_' + str(response.status))
                if response.status == 404:
                    raise SourceError('not_found', 'http', 'http_404')
                if response.status != 200:
                    raise SourceError('unreachable', 'http', 'http_' + str(response.status))
                if response.getheader('Content-Encoding', 'identity').lower() not in ('identity',''):
                    raise SourceError('unsupported', 'response', 'compressed_response')
                content_type = response.getheader('Content-Type', '').lower()
                if not any(t in content_type for t in ('text/html','application/xhtml','application/pdf','text/plain','application/octet-stream')):
                    raise SourceError('unsupported', 'response', 'content_type')
                length = response.getheader('Content-Length')
                if length and int(length) > self.max_bytes:
                    raise SourceError('unsupported', 'response', 'size_limit')
                chunks, total = [], 0
                while True:
                    if self.remaining() <= 0:
                        raise SourceError('timeout', 'body', 'deadline')
                    if connection.sock:
                        connection.sock.settimeout(min(self.timeout, self.remaining()))
                    part = response.read1(min(65536, self.max_bytes + 1 - total))
                    if not part:
                        break
                    chunks.append(part)
                    total += len(part)
                    if total > self.max_bytes:
                        raise SourceError('unsupported', 'body', 'size_limit')
                return FetchResult(url, b''.join(chunks), content_type, int((time.monotonic()-start)*1000))
            except (socket.timeout, TimeoutError):
                raise SourceError('timeout', 'http', 'request_timeout')
            except (OSError, http.client.HTTPException, ValueError):
                raise SourceError('unreachable', 'http', 'connection_failed')
            finally:
                connection.close()
        raise SourceError('blocked', 'redirect', 'redirect_limit')
