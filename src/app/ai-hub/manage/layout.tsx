'use client';
import React, { ReactNode } from 'react';
import { CloudUploadOutlined, DeleteOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Breadcrumb, Layout, Menu, theme } from 'antd';

const { Content, Sider } = Layout;

const items2: MenuProps['items'] = [
  {
    key: `create`,
    icon: React.createElement(CloudUploadOutlined),
    label: `Add AI Tool`,
  },
  {
    key: `delete`,
    icon: React.createElement(DeleteOutlined),
    label: `Delete AI Tool`,
  },
];

const App: React.FC<{ children: ReactNode }> = (props) => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <Layout style={{ height: '100vh' }}>
      {/* <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div className="demo-logo" />
        <Menu
          theme="dark"
          mode="horizontal"
          defaultSelectedKeys={['2']}
          items={items1}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header> */}
      <Layout>
        <Sider width={200} style={{ background: colorBgContainer }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['create']}
            defaultOpenKeys={['sub1']}
            style={{ height: '100%', borderRight: 0 }}
            items={items2}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Breadcrumb items={[{ title: 'Manage' }, { title: 'Add AI Tool' }]} style={{ margin: '16px 0' }} />
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {props.children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default App;
