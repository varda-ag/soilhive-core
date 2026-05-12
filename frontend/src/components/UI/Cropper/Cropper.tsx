import React from 'react';
import CropperLib, { type Area } from 'react-easy-crop';

type CropperCompatProps = {
  image: string;
  crop: { x: number; y: number };
  zoom: number;
  aspect: number;
  onCropChange: (crop: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void;
  rotation?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
  cropShape?: 'rect' | 'round';
  showGrid?: boolean;
  objectFit?: 'contain' | 'cover' | 'horizontal-cover' | 'vertical-cover';
  restrictPosition?: boolean;
  children?: React.ReactNode;
};

export function Cropper(props: CropperCompatProps) {
  return React.createElement(CropperLib as any, props);
}
