import { spawn } from "node:child_process";
import { join } from "node:path";
import { agentConfiguration } from "./config";
import { toolArguments } from "./python-tool";
import { v2ResultSchema, type V2Result } from "./v2-result";

export function runV2Tool(
  args: unknown,
  timeoutMs = 220000,
  action:
    | "investigate_company_channels"
    | "read_company_checkpoint" = "investigate_company_channels",
): Promise<V2Result> {
  const parsed = toolArguments.parse(args),
    config = agentConfiguration();
  return new Promise((resolve, reject) => {
    const inherited = [
      "PATH",
      "Path",
      "SystemRoot",
      "TEMP",
      "TMP",
      "HOME",
      "USERPROFILE",
    ];
    const limits = [
      "RESEARCH_V2_SECONDS",
      "RESEARCH_V2_MAX_REQUESTS",
      "RESEARCH_V2_MAX_BYTES",
      "RESEARCH_V2_HTTP_TIMEOUT",
      "RESEARCH_V2_FOLLOWUP_ROUNDS",
      "RESEARCH_V2_MAX_DOCUMENTS",
      "RESEARCH_V2_CACHE_SECONDS",
    ];
    const env = Object.fromEntries(
      [...inherited, ...limits]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]!]),
    );
    // No API keys, proxy credentials, profile fields, URL arguments, or shell.
    const child = spawn(
      config.python,
      [join(process.cwd(), "modules/research-agent/worker_v2.py")],
      {
        windowsHide: true,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          ...env,
          PYTHONUTF8: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          RESEARCH_V2_SECONDS: String(
            Math.max(
              1,
              Math.min(
                Number(env.RESEARCH_V2_SECONDS) || 150,
                Math.floor(timeoutMs / 1000) - 5,
              ),
            ),
          ),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let finished = false,
      size = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error, value?: V2Result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(
        Error("公开调查达到时间上限，已取得的材料检查点会在再次分析时恢复。"),
      );
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_500_000) {
        child.kill();
        finish(Error("调查输出超过上限；完整材料已留在证据库。"));
      } else chunks.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.on("error", () =>
      finish(Error("Python 公开调查工具不可启动，请检查独立依赖。")),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return finish(Error("公开调查未完成，已保存证据检查点。"));
      try {
        finish(
          undefined,
          v2ResultSchema.parse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          ),
        );
      } catch {
        finish(Error("公开调查输出未通过格式校验，保留原资料。"));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ action, ...parsed }));
  });
}
