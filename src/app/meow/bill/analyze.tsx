'use client';
import {
  Modal,
  Form,
  Button,
  List,
  SwipeAction,
  Toast,
  DatePicker,
  DatePickerRef,
  Tag,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { RefObject, useEffect, useState } from 'react';
import { FormCascader } from '@components/form-cascader';
import { post } from '@libs/fetch';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { getIconFromCategoryId } from '@utils/category';

export default function Analyze({setAnalyzeVisible, analyzeVisible, cascaderOptions}: any) {
    const [categoryVisible, setCategoryVisible] = useState(false);
    const [data, setData] = useState<ITransactionAnalyzeRes | null>(null);
    
    const fetchData = async (values: any) => {
      if (!values.time) {
          console.log('❌ time is empty, skipping...');
          return;
        }
        
        const categoryId = values.category?.[values.category.length - 1];
        
        // 从 Date 对象中提取年月
        const timeObj = dayjs(values.time);
        const year = timeObj.year();
        const month = timeObj.month() + 1; // dayjs month() 是 0-11，需要加1
        
        console.log('📅 Selected:', { year, month, formatted: timeObj.format('YYYY-MM') });
        
        console.log('📤 Sending request with:', { 
          categoryId, 
          year,
          month,
        });
        
        try {
          const res = await post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
            categoryId: categoryId || undefined,
            year,
            month,
          });
          
          console.log('📥 Response:', res);
          
          if (res?.transactions) {
            Toast.show({
              content: '✅ 查询成功',
              position: 'bottom',
            });
            setData(res);
          } else {
            Toast.show({
              content: `未查询到数据`,
              position: 'bottom',
            });
          }
        } catch (err) {
          console.error('❌ Request error:', err);
          Toast.show({
            content: `查询失败: ${err}`,
            position: 'bottom',
          });
        }
    }

    useEffect(() => {
      // Reset data when modal is opened
      if (analyzeVisible) {
        setData(null);
      }
      fetchData({ time: new Date() });
    }, [analyzeVisible]);

    return   <div>
            <Button onClick={() => {setAnalyzeVisible(true)}}>统计分析</Button>

              <Modal
                title= "统计分析"
                visible={analyzeVisible}
                closeOnMaskClick
                showCloseButton
                onClose={() => setAnalyzeVisible(false)}
                content={
                  <div>
                      <Form
                        layout="horizontal"
                        initialValues={{ time: new Date() }}
                        style={{ marginTop: '20px' }}
                        onValuesChange={async(_,values) => {
                            console.log('=== Form values changed ===');
                            console.log('Form values:', values);
                            fetchData(values);
                        }}
                        >
                            <Form.Item name="category" label="分类">
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
                                <DatePicker precision="month">
                                {(value) => (value ? dayjs(value).format('YYYY/MM') : '请选择月份')}
                                </DatePicker>
                            </Form.Item>
                    
                    
                    </Form>

                    {data && data.transactions.length > 0 && <div>
                      <Tag color='success' style={{fontSize:16, marginRight:8,marginLeft:12}}>共{data.transactions.length}笔</Tag>
                      <Tag color='success' style={{fontSize:16}}>合计${data.total.toFixed(2)}元</Tag>
                              <List>
                                  {(data.transactions ?? []).map((transaction) => {
                                    3;
                                    const Icon = getIconFromCategoryId(transaction.category.id);
                                    const { description } = transaction;
                                    return (
                                      <SwipeAction
                                        key={transaction.id}
                                        // rightActions={[
                                        //   {
                                        //     key: 'unsubscribe',
                                        //     text: '删除',
                                        //     color: 'red',
                                        //     onClick: async () => {
                                        //       await post('/api/transaction/delete', { ids: [transaction.id] });
                                        //       Toast.show({
                                        //         content: '删除成功',
                                        //         afterClose: () => reQuery(),
                                        //       });
                                        //     },
                                        //   },
                                        // ]}
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
                    </div>}
                  </div>
                }
              ></Modal>
    </div> 
}