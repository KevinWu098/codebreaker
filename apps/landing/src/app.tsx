import { ImageDithering } from "@paper-design/shaders-react";

export function App() {
  return (
    <div className="fixed inset-0 bg-bg">
      <ImageDithering
        colorBack="#0a2a78"
        colorFront="#eef4ff"
        colorHighlight="#ffffff"
        colorSteps={3}
        fit="cover"
        image="/splash.png"
        inverted={false}
        originalColors={false}
        size={1.6}
        style={{ width: "100%", height: "100%" }}
        type="8x8"
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          padding: "2rem",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontSize: "8rem",
            fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          codebreaker
        </span>
      </div>
    </div>
  );
}
