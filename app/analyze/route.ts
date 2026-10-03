import {NextResponse} from 'next/server';
export function GET(request:Request){
 const url=new URL(request.url);url.pathname='/research';
 return NextResponse.redirect(url);
}
