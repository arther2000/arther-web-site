import { Composition } from "remotion";
import {
  BlackboardShort,
  blackboardSchema,
  calcDuration,
} from "./BlackboardShort";

// 直式短影片：1080x1920、30fps。片長依板書行數自動計算。
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BlackboardShort"
        component={BlackboardShort}
        fps={30}
        width={1080}
        height={1920}
        schema={blackboardSchema}
        defaultProps={{
          title: "政府補助案",
          lines: [
            "第一步：確認自己符合哪個補助",
            "第二步：把計畫書的痛點寫清楚",
            "第三步：預算表要對得上時程",
            "第四步：送件前先找顧問看一遍",
          ],
          coach: "亞瑟教練",
          bgm: undefined,
          bgmVolume: 0.5,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: calcDuration(props.lines),
        })}
      />
    </>
  );
};
