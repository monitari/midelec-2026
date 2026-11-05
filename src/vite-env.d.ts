/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'local' 이면 NYT 대신 npm run fetch:data 가 만든 public/data/*.json 을 쓴다 */
  readonly VITE_DATA?: string;
}
