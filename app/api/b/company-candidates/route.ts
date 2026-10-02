export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) return Response.json({ candidates: [], status: "unresolved", note: "需提供名称；当前无企业查询 provider，名称匹配不构成主体确认。" });
  return Response.json({ candidates: [{ legalName: name, creditCode: null, city: null, identityStatus: "unresolved" }], status: "unresolved", note: "名称与城市仅作线索；未接入工商查询，尚未确认主体。" });
}
