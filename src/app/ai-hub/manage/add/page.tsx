'use client';
import { post } from '@libs/fetch';
import { Button, Form, Input, message } from 'antd';
import React from 'react';

const App: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <Form
      labelCol={{ span: 6 }}
      wrapperCol={{ span: 14 }}
      layout="horizontal"
      style={{ maxWidth: 600 }}
      onFinish={async (values) => {
        const key = 'updatable';
        messageApi.open({
          key,
          type: 'loading',
          content: 'Creating...',
        });
        try {
          const res = (await post('/api/ai-hub-manage/add', values)) as any;
          console.log(res);
          messageApi.open({
            key,
            type: 'success',
            content: `${res?.tool?.name ?? 'Tool'} created successfully!`,
            duration: 2,
          });
        } catch (error) {
          messageApi.open({
            key,
            type: 'error',
            content: `Failed to create tool! Message: ${(error as any)?.message ?? (error as any)?.result}`,
            duration: 2,
          });
        }
      }}
    >
      <Form.Item label="Name" rules={[{ required: true, message: 'Please input the name' }]} name="name">
        <Input placeholder="Please input the name" />
      </Form.Item>
      <Form.Item label="Link" rules={[{ required: true, message: 'Please input the link' }]} name="link">
        <Input placeholder="Please input the link." />
      </Form.Item>
      <Form.Item label="Description" rules={[{ required: true, message: 'Please input the description' }]} name="desc">
        <Input.TextArea rows={4} placeholder="Please input the description" />
      </Form.Item>
      <Form.Item label="SVG Icon" rules={[{ required: true, message: 'Please input svg icon!' }]} name="icon">
        <Input.TextArea rows={4} placeholder="Please paste the svg content here." />
      </Form.Item>
      <Form.Item wrapperCol={{ offset: 6, span: 16 }}>
        <Button type="primary" htmlType="submit">
          Submit
        </Button>
      </Form.Item>
      {contextHolder}
    </Form>
  );
};

export default App;
