'use client';

import { useRouter } from 'next/navigation';
import { post } from '@libs/fetch';
import { Form, Input, Button, Toast } from 'antd-mobile';
import { IUserInfoRes } from '@dtos/meow';

const ACCOUNT_KEY = 'account';

export default function App() {
  const router = useRouter();

  return (
    <div>
      <Form
        onFinish={async (values) => {
          const res = await post<typeof values, IUserInfoRes>('/api/user/sign', values);
          window.localStorage.setItem(ACCOUNT_KEY, res.user.account);
          Toast.show({
            content: '登录成功',
            afterClose: () => router.push('/meow'),
          });
        }}
      >
        <Form.Item label="账号" name="account" required>
          <Input placeholder="请输入账号" />
        </Form.Item>
        <Form.Item label="密码" name="password" required>
          <Input placeholder="请输入密码" />
        </Form.Item>
        <Form.Item label="昵称" name="nickname">
          <Input placeholder="初次使用，注册请输入昵称" />
        </Form.Item>
        <Form.Item>
          <Button block type="submit" color="primary" size="large">
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
