import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 短影片預設 H.264 直式輸出
Config.setCodec("h264");
