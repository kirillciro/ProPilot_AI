import {
  ANNOTATION_FONT_SIZE,
  ANNOTATION_PEN_WIDTH,
  type Annotation,
} from "@propilot/shared";
import { StyleSheet } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

type Point = [number, number];

// A zero-length segment keeps a single tap visible as a dot.
const pathOf = (points: Point[], w: number, h: number) =>
  points.length === 1
    ? `M ${points[0]![0] * w} ${points[0]![1] * h} l 0.01 0`
    : points.map(([x, y], i) => `${i ? "L" : "M"} ${x * w} ${y * h}`).join(" ");

type Props = {
  items: Annotation[];
  width: number;
  height: number;
  /** Stroke still being drawn. */
  live?: { color: string; points: Point[] } | null;
};

/** Draws normalized marks over a photo of the given on-screen size. */
export function AnnotationLayer({ items, width, height, live }: Props) {
  const pen = width * ANNOTATION_PEN_WIDTH;
  const font = width * ANNOTATION_FONT_SIZE;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((item, i) =>
        item.kind === "stroke" ? (
          <Path
            key={i}
            d={pathOf(item.points, width, height)}
            fill="none"
            stroke={item.color}
            strokeWidth={pen}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <SvgText
            key={i}
            x={item.x * width}
            y={item.y * height}
            fill={item.color}
            stroke="#000"
            strokeWidth={font * 0.04}
            fontSize={font}
            fontWeight="bold"
            textAnchor="middle"
          >
            {item.text}
          </SvgText>
        ),
      )}
      {live ? (
        <Path
          d={pathOf(live.points, width, height)}
          fill="none"
          stroke={live.color}
          strokeWidth={pen}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
