import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';

const RootLayout = ({ children }: React.PropsWithChildren) => <AntdRegistry>{children}</AntdRegistry>;

export default RootLayout;
