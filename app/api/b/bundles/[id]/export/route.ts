import {exportsDisabled} from '@/packages/integration/export-policy';
export const dynamic='force-dynamic';
export function GET(_request:Request,_context?:unknown){return exportsDisabled();}
