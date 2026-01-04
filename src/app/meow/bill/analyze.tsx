'use client';
import {
  FloatingBubble,
  Modal,
  Form,
  Button,
  Input,
  List,
  SwipeAction,
  Toast,
  InfiniteScroll,
  DatePicker,
  DatePickerRef,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { HandPayCircleOutline } from 'antd-mobile-icons';
import { RefObject, useState } from 'react';
import { FormCascader } from '@components/form-cascader';

export default ({setAnalyzeVisible, analyzeVisible, cascaderOptions}: any) => {
    const [categoryVisible, setCategoryVisible] = useState(false);
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
                        onValuesChange={(_,values) => {
                            console.log(values);
                            
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

                    <div>

                    </div>
                  </div>
                }
              ></Modal>
    </div> 
}