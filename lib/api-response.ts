import type {RecordItem} from './tracking.ts';
export class ApiResponseError extends Error {}
export async function timerResponse<T extends RecordItem = RecordItem>(response:Response) {
 if(!response.ok){
  const message=response.status===401?'ログインし直してください。':
   response.status===409?'別の端末で更新されました。最新の状態を確認して再度お試しください。':
   response.status>=500?'サーバーに接続できませんでした。少し待って再度お試しください。':
   'タイマーを保存できませんでした。再度お試しください。';
  throw new ApiResponseError(message);
 }
 try{
  const value=await response.json() as {timer:T;sessions:T[];serverNow:number;legacy?:boolean};
  if(!value?.timer||typeof value.timer!=='object'||!Array.isArray(value.sessions))throw Error();
  return value;
 }catch{throw new ApiResponseError('サーバーから正しい応答を受信できませんでした。再読み込みしてください。')}
}
