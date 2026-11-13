import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'15分タイマー | PAU',description:'同期できる15分タイマーと予定・タスク管理。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
