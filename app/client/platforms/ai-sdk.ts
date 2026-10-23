import type {
  ChatOptions,
  LLMApi,
  LLMModel,
  LLMUsage,
  SpeechOptions,
} from "../api";
import { useAccessStore } from "../../store/access";
import { cacheImageToBase64Image } from "../../utils/chat";
import { fetch } from "../../utils/stream";
import { instanceModels } from "../providers";

export class SdkApi implements LLMApi {
  constructor(private readonly providerId: string) {}
  async chat(options: ChatOptions): Promise<void> {
    try {
      const provider = useAccessStore
        .getState()
        .providers.find((p) => p.id === this.providerId);
      if (!provider) throw new Error("服务商实例已删除，请重新选择模型。");
      const { runSdkChat } = await import("../sdk-chat");
      await runSdkChat(provider, options, fetch, cacheImageToBase64Image);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (
        failure.cause instanceof Error &&
        !failure.message.includes(failure.cause.message)
      )
        failure.message += `: ${failure.cause.message}`;
      options.onError?.(failure);
    }
  }
  async models(): Promise<LLMModel[]> {
    return instanceModels(
      useAccessStore
        .getState()
        .providers.filter((p) => p.id === this.providerId),
    );
  }
  async usage(): Promise<LLMUsage> {
    throw new Error("此实例不提供余额查询。");
  }
  async speech(_options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("请通过现有语音设置使用朗读功能。");
  }
}
