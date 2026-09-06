export type Meter = {channelId:number;name:string;device:string;folder:string;buildingCode:string|null;unit:string;mappingStatus:string};
export type Building = {id:string;name:string;abbr:string;buildingCode:string|null;source:string;areaM2:number;heightM:number;heightStatus:string;heightField:string|null;heightMatchOverlap:number;groundM:number;center:[number,number,number];coordinates:[number,number];polygons:number[][][][]};
export type Campus = {buildings:Building[];stats:Record<string,number>;limitations:string[];crs:string;origin:number[]};
export type Terrain = {width:number;depth:number;bounds:number[];heights:number[];origin:number[]};
