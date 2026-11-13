import Planner from './planner';
import { getGoogleUser } from './auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getGoogleUser();
  if (!user) return <main className="auth-page"><h1>15min</h1><p>15分から、今日を整える。</p><p>タイマー・予定・タスク・日別の振り返り</p><a className="primary" href="/auth/login">Googleでログイン</a><p><a href="/demo">架空データでデモを見る</a></p></main>;
  return <Planner/>;
}
