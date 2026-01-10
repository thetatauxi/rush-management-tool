"use client";

import { MeshGradient } from "@paper-design/shaders-react";

export default function BackgroundShader() {
  return (
    <div className="fixed inset-0 -z-10">
      <MeshGradient
        speed={1}
        scale={1}
        distortion={0.86}
        swirl={0.26}
        grainMixer={0.55}
        grainOverlay={0}
        colors={["#FFD64F", "#FF6352FA"]}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
