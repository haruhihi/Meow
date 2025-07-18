'use client';

import React, { useEffect, useState } from 'react';
import { Calendar, Card, FloatingBubble, Modal, Toast, Input, Form, Button, Stepper } from 'antd-mobile';
import dayjs from 'dayjs';
import classNames from 'classnames';
import { AddCircleOutline, RightOutline } from 'antd-mobile-icons';
import styles from './index.module.scss';
import { post } from '@libs/fetch';
import { handleError, useRefresh } from '@utils/tool';
import { ITrekSearchRes } from '@dtos/meow';
import { TopLoading } from '@components/loading';

const TYPE: any = {
  exercise:{
    name:'健身',
    default: 1
  },
  sleep:{
    name:'睡眠',
    default:7
  },
  junkfood:{
    name:'垃圾食品',
    default:0
  },
  brushteeth:{
    name:'刷牙',
    default:2
  }
}


export default function App() {
  const [res, setRes] = useState<ITrekSearchRes>();
  const [selectedType, setSelectedType] = useState<string>();
  const [newTypes, setNewTypes] = useState<string[]>([]);
  const refresh = useRefresh();
  useEffect(() => {
    post<null, ITrekSearchRes>('/api/trek/search')
      .then((res) => {
        setRes(res);
        setSelectedType(res.treks[0]?.type);
      })
      .catch((err) => {
        handleError(err);
      });
  }, [refresh.refreshSignal]);

  const onCreate = (newTypes: string) => {
    setNewTypes((types) => [...types, newTypes]);
  };

  if (!res || !selectedType) {
    return <TopLoading />;
  }

  let allTypes = res.treks.map((t) => t.type).concat(newTypes);
  allTypes = [...new Set(allTypes)];
  

  return (
    <div>
      <ATrek type={selectedType} res={res} onRefresh={() => refresh.refresh()} />
      {allTypes.length !== 0 ? (
        <>
          {allTypes.map((type, index) => {
            return (
              <FloatingBubble
                key={type}
                className={classNames({ [styles['un-selected-bubble']]: selectedType !== type })}
                style={{
                  '--initial-position-bottom': `${180 + 80 * index}px`,
                  '--initial-position-right': '24px',
                  '--edge-distance': '44px',
                }}
                onClick={() => {
                  setSelectedType(type);
                }}
              >
                {type}
              </FloatingBubble>
            );
          })}
          <AddButton onCreate={onCreate} />
        </>
      ) : (
        <AddButton onCreate={onCreate} />
      )}
    </div>
  );
}

const AddButton: React.FC<{ onCreate: (newType: string) => void }> = (props) => {
  const { onCreate } = props;

  return (
    <FloatingBubble
      style={{
        '--initial-position-bottom': `${100}px`,
        '--initial-position-right': '24px',
        '--edge-distance': '44px',
      }}
      onClick={async () => {
        const handler = Modal.show({
          title: '请输入新增的类型',
          content: (
            <Form
              layout="horizontal"
              footer={
                <Button block type="submit" color="primary" size="large">
                  新增
                </Button>
              }
              onFinish={(values) => {
                onCreate(values.newType);
                handler.close();
              }}
            >
              <Form.Item name="newType" label="类型" rules={[{ required: true, message: '类型不能为空' }]}>
                <Input placeholder="请输入新类型" />
              </Form.Item>
            </Form>
          ),
        });
      }}
    >
      <AddCircleOutline fontSize={32} />
    </FloatingBubble>
  );
};

const ATrek: React.FC<{ type: string; res: ITrekSearchRes; onRefresh: () => void }> = (props) => {
  const {
    type,
    onRefresh,
    res: { treks },
  } = props;
  const [visible, setVisible] = useState(false);
  const [originDate, setOriginDate] = useState<Date>();
  
  const isSelected = (date: Date) => {
    return treks.some((trek) => {
      return dayjs(trek.date).isSame(dayjs(date), 'day');
    });
  };
  return (
    <Card
      title={<div style={{ fontWeight: 'normal' }}>{type}</div>}
      extra={<RightOutline />}
      style={{ borderRadius: '16px' }}
    >
      <div className={styles.content}>
        <Calendar
          renderDate={(date) => {
            return (
              <div
                className={classNames(styles['custom-cell'], {
                  [styles['custom-cell-selected']]: isSelected(date),
                })}
              >
                {dayjs(date).date()}
              </div>
            );
          }}
          selectionMode="single"
          onChange={(originDate: Date | null) => {
            if (!originDate) {
              return;
            }
            setVisible(true);
            setOriginDate(originDate)
          }}
        />
      </div>
      <Modal
        destroyOnClose
        visible={visible}
        closeOnMaskClick
        showCloseButton
        onClose={() => {
          setVisible(false);
          setOriginDate(undefined);
        }}
        content={
          <Form
            layout="horizontal"
            footer={
              <Button block type="submit" color="primary" size="large">
                提交
              </Button>
            }
            initialValues={{
              exercise:1,
              sleep: 7,
              junkfood:0,
              brushteeth:2
            }}
            style={{ marginTop: '20px' }}
            onFinish={async (values: any) => {
              if (!values) return console.log('values is empty');
              if (!originDate) {
                return;
              }
              const date =  dayjs(originDate).unix() * 1000;

              const data = Object.keys(values).map(((key)=> {
                return {
                  date: date,
                  count: values[key],
                  type:(TYPE as any)[key].name,
                }
              })).filter(v => !!v.count);

              try {
                await post('/api/trek/multi-create', data);
                Toast.show({
                  content: '打卡成功',
                  afterClose: () => {
                    setVisible(false);
                    setOriginDate(undefined)
                    onRefresh();
                  },
                });
              } catch (error) {
                handleError(error);
              }
            }}
          >

            {
              Object.keys(TYPE).map(name => {
                return (<Form.Item name={name} label={TYPE[name].name} key = {name}>
                  <Stepper  min={0} />
                </Form.Item>)
              })
            }
          </Form>
        }
      ></Modal>
    </Card>
  );
};
