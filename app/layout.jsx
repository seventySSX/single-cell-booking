import './globals.css';

export const metadata = {
  title: '单电池仪器预约平台',
  description: '用于课题组共享的单电池仪器在线预约平台'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
