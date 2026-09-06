// The hosted site never reads operational data. Browsers pair with a loopback connector.
export async function GET(){
 return Response.json({error:'Pair this browser with the local connector to read live data.'},{status:403,headers:{'Cache-Control':'no-store'}});
}
