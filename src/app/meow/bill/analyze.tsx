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
import { RefObject, useEffect, useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { FormCascader } from '@components/form-cascader';
import { post } from '@libs/fetch';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { getIconFromCategoryId } from '@utils/category';

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

export default function Analyze({setAnalyzeVisible, analyzeVisible, cascaderOptions}: any) {
    const [categoryVisible, setCategoryVisible] = useState(false);
    const [data, setData] = useState<ITransactionAnalyzeRes | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'pie'>('list');
    const [groupByParent, setGroupByParent] = useState(false);
    console.log('cascaderOptions', cascaderOptions);
    
    // 生成扇形图数据
    const generatePieData = (): CategoryData[] => {
      if (!data || !data.transactions.length) return [];
      
      const categoryMap = new Map<string, { name: string; value: number }>();
      
      data.transactions.forEach((transaction) => {
        const categoryId = String(transaction.category.id);
        const categoryName = transaction.category.name;
        
        if (categoryMap.has(categoryId)) {
          const existing = categoryMap.get(categoryId)!;
          existing.value += transaction.amount;
        } else {
          categoryMap.set(categoryId, {
            name: categoryName,
            value: transaction.amount,
          });
        }
      });
      
      return Array.from(categoryMap.values()).map((item, index) => ({
        name: item.name,
        value: item.value,
        color: COLORS[index % COLORS.length],
      }));
    };
    
    // 按父类别生成扇形图数据 - 根据最外层类别分组
    const generateParentPieData = (): CategoryData[] => {
      if (!data || !data.transactions.length) return [];
      
      const parentMap = new Map<string, { name: string; value: number }>();
      
      // 从cascaderOptions中建立 categoryId -> 最外层类别名称 的映射
      const categoryToTopLevelMap = new Map<string, string>();
      
      // 递归函数：遍历整个树形结构，为每个类别ID关联其最外层的父类别
      const buildCategoryToTopLevelMap = (options: any[], topLevelName: string) => {
        if (!options) return;
        options.forEach((option) => {
          // 当前类别ID对应的最外层父类别是topLevelName
          categoryToTopLevelMap.set(String(option.value), topLevelName);
          
          // 递归处理子选项，保持topLevelName不变
          if (option.children && option.children.length > 0) {
            buildCategoryToTopLevelMap(option.children, topLevelName);
          }
        });
      };
      
      // 从最外层开始遍历
      if (cascaderOptions && cascaderOptions.length > 0) {
        (cascaderOptions as any[]).forEach((topLevelOption) => {
          // 最外层的类别也要加入映射
          categoryToTopLevelMap.set(String(topLevelOption.value), topLevelOption.label);
          
          // 递归处理子选项
          if (topLevelOption.children && topLevelOption.children.length > 0) {
            buildCategoryToTopLevelMap(topLevelOption.children, topLevelOption.label);
          }
        });
      }
      
      // 按最外层类别分组统计
      data.transactions.forEach((transaction) => {
        const categoryId = String(transaction.category.id);
        const topLevelName = categoryToTopLevelMap.get(categoryId) || '其他';
        
        if (parentMap.has(topLevelName)) {
          const existing = parentMap.get(topLevelName)!;
          existing.value += transaction.amount;
        } else {
          parentMap.set(topLevelName, {
            name: topLevelName,
            value: transaction.amount,
          });
        }
      });
      
      return Array.from(parentMap.values()).map((item, index) => ({
        name: item.name,
        value: item.value,
        color: COLORS[index % COLORS.length],
      }));
    };
    
    // 扇形图组件
    const PieChart = ({ data }: { data: CategoryData[] }) => {
      const chartRef = useRef<any>(null);
      
      if (data.length === 0) return null;
      
      const chartData = data.map((item) => ({
        value: Number(item.value.toFixed(2)),
        name: item.name,
        itemStyle: { color: item.color },
      }));
      
      const option = {
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            if (params.componentSubType === 'pie') {
              return `${params.name}<br/>¥${params.value.toFixed(2)}<br/>${params.percent}%`;
            }
            return '';
          },
        },
        series: [
          {
            name: '支出分类',
            type: 'pie',
            radius: ['0%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 2,
            },
            label: {
              show: true,
              position: 'inside',
              formatter: (params: any) => {
                return `${params.name}\n¥${params.value}`;
              },
              color: '#fff',
              fontSize: 11,
              fontWeight: 'bold',
              textShadowColor: 'rgba(0, 0, 0, 0.5)',
              textShadowBlur: 3,
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 12,
                fontWeight: 'bold',
              },
            },
            data: chartData,
          },
        ],
      };
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
          <ReactECharts 
            ref={chartRef}
            option={option} 
            style={{ width: '100%', height: '350px' }}
            notMerge
            lazyUpdate
          />

        </div>
      );
    };
    
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
        fetchData({ time: new Date() });
      }
      
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
                      
                      <div style={{ display: 'flex', gap: '8px', margin: '12px', justifyContent: 'center' }}>
                        <Button 
                          size='small' 
                          color={viewMode === 'list' ? 'primary' : 'default'}
                          onClick={() => setViewMode('list')}
                        >
                          列表
                        </Button>
                        <Button 
                          size='small' 
                          color={viewMode === 'pie' ? 'primary' : 'default'}
                          onClick={() => setViewMode('pie')}
                        >
                          扇形图
                        </Button>
                      </div>
                      
                      {viewMode === 'pie' && (
                        <div style={{ display: 'flex', gap: '8px', margin: '8px', justifyContent: 'center' }}>
                          <Button 
                            size='small' 
                            color={!groupByParent ? 'primary' : 'default'}
                            onClick={() => setGroupByParent(false)}
                          >
                            详细分类
                          </Button>
                          <Button 
                            size='small' 
                            color={groupByParent ? 'primary' : 'default'}
                            onClick={() => setGroupByParent(true)}
                          >
                            父类别
                          </Button>
                        </div>
                      )}
                      
                      {viewMode === 'pie' ? (
                        <PieChart data={groupByParent ? generateParentPieData() : generatePieData()} />
                      ) : (
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
                      )}
                    </div>}
                  </div>
                }
              ></Modal>
    </div> 
}