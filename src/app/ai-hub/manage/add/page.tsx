'use client';
import { post } from '@libs/fetch';
import { Button, Radio, Form, Input, message, Slider } from 'antd';
import React from 'react';

const App: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const isEnableMoreInput = global?.location?.href?.indexOf('enmoreinput') > -1;

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
      <Form.Item label="Link" rules={[{ required: true, message: 'Please input the link' }]} name="link">
        <Input placeholder="Please input the link." />
      </Form.Item>
      <Form.Item label="Name" rules={[{ required: true, message: 'Please input the name' }]} name="name">
        <Input placeholder="Please input the name" />
      </Form.Item>
      <Form.Item label="Description" rules={[{ required: true, message: 'Please input the description' }]} name="desc">
        <Input.TextArea rows={4} placeholder="Please input the description" />
      </Form.Item>
      <Form.Item label="SVG Icon" name="icon">
        <Input.TextArea rows={4} placeholder="Please paste the svg content here." />
      </Form.Item>
      {isEnableMoreInput && (
        <>
          <Form.Item
            label="Category1"
            name="category1"
            rules={[{ required: true, message: 'Please input the category1' }]}
          >
            <Input placeholder="Please input the category1" />
          </Form.Item>
          <Form.Item label="Category2" name="category2">
            <Input placeholder="Please input the category2" />
          </Form.Item>
          <Form.Item label="Tags" name="tags" rules={[{ required: true, message: 'Please input the tags' }]}>
            <Input placeholder="Please input the tags, use comma to split" />
          </Form.Item>
          <Form.Item label="Registration" name="registration">
            <Radio.Group
              options={[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Unknown' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Free" name="free">
            <Radio.Group
              options={[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Unknown' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Pro" name="pro">
            <Radio.Group
              options={[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Unknown' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Pro Price" name="pro_price">
            <Input placeholder="Please input the price" />
          </Form.Item>
          <Form.Item label="Score" name="score">
            <Slider />
          </Form.Item>
        </>
      )}
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
