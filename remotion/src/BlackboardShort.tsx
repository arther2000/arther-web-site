import { z } from "zod";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ---- 時間參數（單位：幀）----
export const TITLE_DURATION = 45; // 標題出場約 1.5 秒
export const FRAMES_PER_LINE = 60; // 每句板書停留約 2 秒
export const OUTRO_DURATION = 75; // 結尾署名約 2.5 秒

export const blackboardSchema = z.object({
  title: z.string(),
  lines: z.array(z.string()),
  coach: z.string(),
  // 放在 public/ 底下的檔名，例如 "bgm.mp3"；留空則無配樂
  bgm: z.string().optional(),
  bgmVolume: z.number().min(0).max(1).optional(),
});

type Props = z.infer<typeof blackboardSchema>;

// 依 props 計算總片長，給 Composition 的 calculateMetadata 用
export const calcDuration = (lines: string[]) =>
  TITLE_DURATION + lines.length * FRAMES_PER_LINE + OUTRO_DURATION;

// 單句板書：粉筆「寫上去」效果（由左往右擦亮 + 上浮）
const ChalkLine: React.FC<{ text: string; index: number }> = ({
  text,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(appear, [0, 1], [30, 0]);
  // 由左往右揭開，模擬粉筆書寫
  const reveal = interpolate(frame, [0, 18], [0, 100], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 28,
        opacity: appear,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#ffe38a",
          flexShrink: 0,
          marginTop: 30,
          opacity: appear,
        }}
      />
      <div
        style={{
          fontSize: 62,
          fontWeight: 600,
          lineHeight: 1.35,
          color: "#f6f3e7",
          clipPath: `inset(0 ${100 - reveal}% 0 0)`,
          textShadow: "0 2px 0 rgba(255,255,255,0.12)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// 黑板風格直式短影片：標題 → 多段板書逐句浮現 → 署名，可加 BGM
export const BlackboardShort: React.FC<Props> = ({
  title,
  lines,
  coach,
  bgm,
  bgmVolume = 0.5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const titleY = interpolate(titleIn, [0, 1], [40, 0]);
  // 板書開始後標題縮到上方
  const linesStart = TITLE_DURATION;
  const shrink = spring({
    frame: frame - linesStart,
    fps,
    config: { damping: 200 },
  });
  const titleScale = interpolate(shrink, [0, 1], [1, 0.62]);
  const titleTop = interpolate(shrink, [0, 1], [0, -560]);

  const outroStart = TITLE_DURATION + lines.length * FRAMES_PER_LINE;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 30%, #1f3a34 0%, #12211d 70%, #0b1613 100%)",
        fontFamily:
          "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
        color: "#f6f3e7",
      }}
    >
      {bgm ? <Audio src={staticFile(bgm)} volume={bgmVolume} /> : null}

      {/* 標題 */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(${titleTop}px) scale(${titleScale})`,
        }}
      >
        <div
          style={{
            fontSize: 130,
            fontWeight: 800,
            letterSpacing: 4,
            opacity: titleIn,
            transform: `translateY(${titleY}px)`,
            textShadow: "0 2px 0 rgba(255,255,255,0.15)",
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          {title}
        </div>
      </AbsoluteFill>

      {/* 多段板書逐句浮現 */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: "0 90px",
          gap: 42,
        }}
      >
        {lines.map((line, i) => (
          <Sequence
            key={i}
            from={TITLE_DURATION + i * FRAMES_PER_LINE}
            durationInFrames={
              calcDuration(lines) - (TITLE_DURATION + i * FRAMES_PER_LINE)
            }
            layout="none"
          >
            <ChalkLine text={line} index={i} />
          </Sequence>
        ))}
      </AbsoluteFill>

      {/* 署名 */}
      <Sequence from={outroStart} layout="none">
        <Signature coach={coach} />
      </Sequence>
    </AbsoluteFill>
  );
};

const Signature: React.FC<{ coach: string }> = ({ coach }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center" }}
    >
      <div
        style={{
          marginBottom: 150,
          fontSize: 52,
          opacity: appear,
          borderTop: "2px solid rgba(246,243,231,0.4)",
          paddingTop: 26,
        }}
      >
        — {coach}
      </div>
    </AbsoluteFill>
  );
};
