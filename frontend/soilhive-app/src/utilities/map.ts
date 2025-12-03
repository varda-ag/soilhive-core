export function h3ResolutionForZoomLevel(zoomLevel: number): number {
  switch (Math.trunc(zoomLevel)) {
    case 0:
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
    case 5:
      return 4;
    case 6:
      return 5;
    case 7:
    case 8:
      return 6;
    case 9:
    case 10:
      return 7;
    case 11:
      return 8;
    case 12:
    case 13:
      return 9;
    case 14:
    case 15:
      return 10;
    case 16:
      return 11;
    case 17:
    case 18:
      return 12;
    case 19:
    case 20:
      return 13;
    default:
      return 14;
  }
}