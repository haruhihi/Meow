import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';

export const metadata = {
  title: 'AI Tools',
  description: 'Discover and use our powerful AI tools to enhance your workflow',
};

const RootLayout = ({ children }: React.PropsWithChildren) => <AntdRegistry>{children}</AntdRegistry>;

export default RootLayout;
