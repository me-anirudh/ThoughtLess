import { create } from "zustand";

// This is the section which tells how much we have zoomed and how much we can see
{/*
zoom = 1.0  // 100%
zoom = 2.0  // 200% — zoomed in
zoom = 0.5  // 50% — zoomed out */}
interface CameraState {

zoom: number;


//From the point of zoomed, how much we have moved is the pan. 
 panX: number;

 panY: number;

 setZoom: (zoomed: number) => void;

 setPan: (x: number, y: number) => void;

 // Derived: getViewportBounds() computed from zoom + pan + container size

}

export const useCameraStore = create<CameraState>((set) => ({
        zoom : 1, 

        panX : 0, 
        panY : 0, 

        setZoom : (zoomed) => {
                set({zoom : zoomed})
        }, 
        setPan : (x, y) => {
                set({panX : x, panY : y})
        }
})); 

