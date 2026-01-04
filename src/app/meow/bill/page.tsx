'use client';
import {
  FloatingBubble,
  Modal,
  Form,
  Button,
  Input,
  List,
  SwipeAction,
  Empty,
  Toast,
  InfiniteScroll,
  DatePicker,
  DatePickerRef,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { HandPayCircleOutline } from 'antd-mobile-icons';
import { RefObject, useState } from 'react';
import { useTransactions } from '@utils/transaction';
import { useCategories, getCategoryOptions, getIconFromCategoryId } from '@utils/category';
import { ITransactionCreateReq, ITransactionCreateRes } from '@dtos/meow';
import { post } from '@libs/fetch';
import { FormCascader } from '@components/form-cascader';
import { TopLoading } from '@components/loading';
import Analyze from './analyze';

export default function App() {
  const [visible, setVisible] = useState(false);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [analyzeVisible, setAnalyzeVisible] = useState(false);
  const categoryRes = useCategories();
  const { transactions, reQuery, loadMore, hasMore } = useTransactions();

  const onClick = () => {
    setVisible(true);
    setCategoryVisible(true);
  };

  if (!categoryRes || transactions === undefined) {
    return <TopLoading />;
  }

  const cascaderOptions = getCategoryOptions(categoryRes.categories);
  console.log(cascaderOptions);

  

  return (
    <div>
      {transactions.length > 0 ? (
        <div>
          <Analyze setAnalyzeVisible={setAnalyzeVisible} analyzeVisible = {analyzeVisible} cascaderOptions = {cascaderOptions} />
          <List>
            {(transactions ?? []).map((transaction) => {
              3;
              const Icon = getIconFromCategoryId(transaction.category.id);
              const { description } = transaction;
              return (
                <SwipeAction
                  key={transaction.id}
                  rightActions={[
                    {
                      key: 'unsubscribe',
                      text: '删除',
                      color: 'red',
                      onClick: async () => {
                        await post('/api/transaction/delete', { ids: [transaction.id] });
                        Toast.show({
                          content: '删除成功',
                          afterClose: () => reQuery(),
                        });
                      },
                    },
                  ]}
                >
                  <List.Item
                    key={transaction.id}
                    prefix={<Icon style={{ fontSize: '24px', color: '#1677ff' }} />}
                    description={`${dayjs(transaction.date).format('YYYY-MM-DD HH:mm')}  ${transaction.category.name}`}
                  >
                    <div>
                      {transaction.amount}元{description ? `- (${description})` : ''}
                    </div>
                  </List.Item>
                </SwipeAction>
              );
            })}
          </List>
          <InfiniteScroll loadMore={loadMore} hasMore={hasMore} threshold={0} />
        </div>
      ) : (
        <Empty style={{ padding: '64px 0' }} imageStyle={{ width: 128 }} description="暂无数据" />
      )}
      <FloatingBubble
        style={{
          '--initial-position-bottom': '100px',
          '--initial-position-right': '24px',
          '--edge-distance': '44px',
        }}
        onClick={onClick}
      >
        <HandPayCircleOutline fontSize={32} />
      </FloatingBubble>

      <Modal
        visible={visible}
        closeOnMaskClick
        showCloseButton
        onClose={() => setVisible(false)}
        content={
          <Form
            layout="horizontal"
            footer={
              <Button block type="submit" color="primary" size="large">
                提交
              </Button>
            }
            initialValues={{ time: new Date() }}
            style={{ marginTop: '20px' }}
            onFinish={async (values: { amount: string; category: string[]; time: Date; description?: string }) => {
              if (!values) return console.log('values is empty');
              const { amount, category, time, description } = values;
              const res = await post<ITransactionCreateReq, ITransactionCreateRes>('/api/transaction/create', {
                amount: Number(amount),
                categoryId: Number(category[category.length - 1]),
                date: dayjs(time).unix() * 1000,
                description,
              });
              Toast.show({
                content: '记录成功',
                afterClose: () => {
                  setVisible(false);
                  reQuery();
                  console.log(res);
                },
              });
            }}
          >
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <FormCascader
                options={cascaderOptions ?? []}
                categoryVisible={categoryVisible}
                setCategoryVisible={(visible: boolean) => setCategoryVisible(visible)}
              />
            </Form.Item>

            <Form.Item
              name="time"
              label="时间"
              trigger="onConfirm"
              onClick={(e, datePickerRef: RefObject<DatePickerRef>) => {
                datePickerRef.current?.open();
              }}
            >
              <DatePicker precision="minute">
                {(value) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '请选择日期')}
              </DatePicker>
            </Form.Item>

            <Form.Item name="amount" label="金额" rules={[{ required: true, message: '金额不能为空' }]}>
              <Input placeholder="请输入金额" type="number" />
            </Form.Item>

            <Form.Item name="description" label="备注">
              <Input placeholder="请输入备注" type="string" />
            </Form.Item>
          </Form>
        }
      ></Modal>
    </div>
  );
}
