import { demoSample } from "@/modules/b-research/service";

export async function GET() { return Response.json(demoSample()); }
