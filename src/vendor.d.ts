declare module 'astronomia/sidereal' {
  export function mean(jd: number): number;
}
declare module 'astronomia/solar' {
  export function trueLongitude(centuries: number): { lon: number; ano: number };
  export function radius(centuries: number): number;
}
declare module 'astronomia/moonposition' {
  export function position(jde: number): { lon: number; lat: number; range: number };
}
declare module 'astronomia/nutation' {
  export function meanObliquity(jde: number): number;
}
declare module 'astronomia/deltat' {
  export function deltaT(decimalYear: number): number;
}
declare module 'astronomia/coord' {
  export class Equatorial {
    constructor(ra?: number, dec?: number);
    ra: number;
    dec: number;
    toHorizontal(observer: { lat: number; lon: number }, stSeconds: number): Horizontal;
    toEcliptic(obliquity: number): Ecliptic;
  }
  export class Horizontal {
    constructor(az?: number, alt?: number);
    az: number;
    alt: number;
    toEquatorial(observer: { lat: number; lon: number }, stSeconds: number): Equatorial;
  }
  export class Ecliptic {
    constructor(lon?: number, lat?: number);
    lon: number;
    lat: number;
    toEquatorial(obliquity: number): Equatorial;
  }
}
