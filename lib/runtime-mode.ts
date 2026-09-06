declare const __PUBLIC_VIEWER__:boolean;
declare const __ASSET_BASE__:string;
export const PUBLIC_VIEWER=typeof __PUBLIC_VIEWER__!=='undefined'&&__PUBLIC_VIEWER__;
export function assetPath(path:string){return (typeof __ASSET_BASE__==='undefined'?'/':__ASSET_BASE__)+path.replace(/^\/+/, '');}
