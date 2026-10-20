import type { AsrProviderType, Intent, NluProviderType, NluResult, TtsProviderType } from '@ura/shared';

export interface SpeechConfig {
  asrProvider: AsrProviderType;
  ttsProvider: TtsProviderType;
  nluProvider: NluProviderType;
  language: string; // pt-BR
  ttsVoice?: string;
  /** modelo do LLM para NLU (ex.: gpt-4o-mini) */
  nluModel?: string;
  /** modelo ASR (ex.: whisper-1) */
  asrModel?: string;
  /** modelo TTS (ex.: tts-1) */
  ttsModel?: string;
  /** Google: credenciais JSON de service account */
  googleCredentialsJson?: string;
  azureRegion?: string;
  /** base url alternativa compativel com OpenAI */
  openaiBaseUrl?: string;
  [key: string]: unknown;
}

export interface SpeechSecrets {
  openaiApiKey?: string;
  googleApiKey?: string;
  azureSpeechKey?: string;
  [key: string]: string | undefined;
}

export interface SpeechProviderOptions {
  config: SpeechConfig;
  secrets: SpeechSecrets;
  /** diretorio de cache de audios TTS (ja no formato do asterisk) */
  cacheDir: string;
  timeoutMs?: number;
}

export interface AsrProvider {
  /**
   * Transcreve um arquivo de audio (wav 8k/16k mono) e retorna o texto.
   */
  transcribe(filePath: string, language: string): Promise<{ text: string; confidence?: number }>;
}

export interface TtsProvider {
  /**
   * Sintetiza texto e grava em outPath (wav PCM 16-bit). O chamador converte para o formato do Asterisk.
   */
  synthesize(text: string, outPath: string, opts: { language: string; voice?: string }): Promise<void>;
}

export interface NluProvider {
  /**
   * Classifica a fala em uma intent e extrai entidades.
   * @param allowedIntents intents validas no contexto atual
   * @param entity entidade esperada (cpf_cnpj, phone, name, address...) ou undefined
   */
  analyze(
    text: string,
    allowedIntents: Intent[],
    entity: string | undefined,
    language: string,
  ): Promise<NluResult>;
}

/**
 * Servico de fala completo utilizado pelo engine de URA.
 */
export interface SpeechService {
  /** Transcreve audio gravado pelo Asterisk (caminho sem extensao ou com .wav) */
  transcribe(filePath: string): Promise<string>;
  /**
   * Retorna o caminho (sem extensao) de um audio pronto para `Playback`/ARI `sound:` com o texto sintetizado.
   * Usa cache por hash(text+voice+language). O arquivo gerado tem extensao .sln16 (16kHz) ou .wav 8k.
   */
  tts(text: string): Promise<string>;
  analyze(text: string, allowedIntents: Intent[], entity?: string): Promise<NluResult>;
}

export class SpeechError extends Error {
  constructor(
    message: string,
    public readonly code: 'AUTH' | 'CONNECTION' | 'INVALID' | 'UNKNOWN' = 'UNKNOWN',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SpeechError';
  }
}
