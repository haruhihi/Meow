'use client';

import { RefObject, useState } from 'react';
import { Button, DatePicker, DatePickerRef, Dialog, Empty, Form, Modal, NavBar, TextArea, Toast } from 'antd-mobile';
import { AddCircleOutline, DeleteOutline, EditSOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { post } from '@libs/fetch';
import {
  IStockRemarkCreateReq,
  IStockRemarkCreateRes,
  IStockRemarkDeleteReq,
  IStockRemarkDeleteRes,
  IStockRemarkUpdateReq,
  IStockRemarkUpdateRes,
  StockRemarkListItem,
} from '@dtos/meow';
import { useStockRemarks } from '@utils/stock';
import styles from './remarks.module.scss';

type RemarkFormValues = {
  remarkDate: Date;
  content: string;
};

type EditingRemark = StockRemarkListItem | null;

const toRemarkDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseRemarkDate = (value?: string | null) => {
  if (!value) return new Date();
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const formatRemarkDate = (value: string) => value.replace(/-/g, '/');

export default function StockRemarksPage({ params }: { params: { symbol: string } }) {
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { remarks, symbolName, loading, reQuery } = useStockRemarks(symbol);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EditingRemark>(null);

  const openCreate = () => {
    setEditing(null);
    setModalVisible(true);
  };

  const openEdit = (remark: StockRemarkListItem) => {
    setEditing(remark);
    setModalVisible(true);
  };

  const saveRemark = async (values: RemarkFormValues) => {
    const content = values.content?.trim();
    if (!content) {
      Toast.show({ content: '请输入评语' });
      return;
    }

    try {
      if (editing) {
        await post<IStockRemarkUpdateReq, IStockRemarkUpdateRes>('/api/stock/remark/update', {
          id: editing.id,
          remarkDate: toRemarkDate(values.remarkDate),
          content,
        });
        Toast.show({ content: '已保存' });
      } else {
        await post<IStockRemarkCreateReq, IStockRemarkCreateRes>('/api/stock/remark/create', {
          symbol,
          remarkDate: toRemarkDate(values.remarkDate),
          content,
        });
        Toast.show({ content: '已创建' });
      }
      setModalVisible(false);
      await reQuery();
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const deleteRemark = async (remark: StockRemarkListItem) => {
    const ok = await Dialog.confirm({ title: '删除评语', content: `确认删除 ${formatRemarkDate(remark.remarkDate)} 的评语吗？` });
    if (!ok) return;

    try {
      await post<IStockRemarkDeleteReq, IStockRemarkDeleteRes>('/api/stock/remark/delete', { id: remark.id });
      Toast.show({ content: '已删除' });
      await reQuery();
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        股票评语
      </NavBar>

      <header className={styles.header}>
        <div>
          <h1>{symbol}</h1>
          <p>{symbolName && symbolName !== symbol ? `${symbolName} · ${remarks.length} 条评语` : `${remarks.length} 条评语`}</p>
        </div>
        <Button size="small" color="primary" className={styles.createButton} onClick={openCreate}>
          <span className={styles.createButtonText}>
            <AddCircleOutline />
            <span>新建</span>
          </span>
        </Button>
      </header>

      {remarks.length > 0 ? (
        <section className={styles.remarkList}>
          {remarks.map((remark) => (
            <article key={remark.id} className={styles.remarkCard}>
              <div className={styles.remarkTopline}>
                <strong>{formatRemarkDate(remark.remarkDate)}</strong>
                <div className={styles.remarkActions}>
                  <Button size="mini" onClick={() => openEdit(remark)}>
                    <EditSOutline />
                  </Button>
                  <Button size="mini" color="danger" fill="outline" onClick={() => deleteRemark(remark)}>
                    <DeleteOutline />
                  </Button>
                </div>
              </div>
              <p>{remark.content}</p>
            </article>
          ))}
        </section>
      ) : (
        <Empty style={{ padding: '72px 0' }} description={loading ? '评语加载中' : '暂无评语'} />
      )}

      <RemarkModal
        key={editing?.id ?? 'create'}
        visible={modalVisible}
        remark={editing}
        onClose={() => setModalVisible(false)}
        onSave={saveRemark}
      />
    </main>
  );
}

const RemarkModal: React.FC<{
  visible: boolean;
  remark: EditingRemark;
  onClose: () => void;
  onSave: (values: RemarkFormValues) => Promise<void>;
}> = ({ visible, remark, onClose, onSave }) => (
  <Modal
    visible={visible}
    title={remark ? '修改评语' : '新建评语'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{
          remarkDate: parseRemarkDate(remark?.remarkDate),
          content: remark?.content ?? '',
        }}
        footer={<Button block type="submit" color="primary">保存</Button>}
        onFinish={onSave}
      >
        <Form.Item
          name="remarkDate"
          label="日期"
          trigger="onConfirm"
          rules={[{ required: true, message: '请选择日期' }]}
          onClick={(e, ref: RefObject<DatePickerRef>) => ref.current?.open()}
        >
          <DatePicker precision="day">
            {(value) => (value ? toRemarkDate(value) : '请选择日期')}
          </DatePicker>
        </Form.Item>
        <Form.Item name="content" label="评语" rules={[{ required: true, message: '请输入评语' }]}> 
          <TextArea placeholder="写下今天的判断、变化或疑问" autoSize={{ minRows: 5, maxRows: 10 }} />
        </Form.Item>
      </Form>
    }
  />
);