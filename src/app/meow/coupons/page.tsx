'use client';

import { useEffect, useState, RefObject } from 'react';
import dayjs from 'dayjs';
import { Button, DatePicker, DatePickerRef, Dialog, Empty, Form, Input, List, Modal, NavBar, Toast } from 'antd-mobile';
import { AddCircleOutline, EditSOutline, DeleteOutline, PayCircleOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import type { Coupon } from '@prisma/client';
import { post } from '@libs/fetch';
import {
  ICouponCreateReq,
  ICouponCreateRes,
  ICouponDeleteReq,
  ICouponSearchReq,
  ICouponSearchRes,
  ICouponSeedRes,
  ICouponUpdateReq,
  ICouponUpdateRes,
} from '@dtos/meow';
import { formatMoney } from '@styles/theme';
import styles from './coupons.module.scss';

type EditingCoupon = Coupon | null;

const toMonthDate = (coupon?: Coupon | null) =>
  coupon ? new Date(coupon.validYear, coupon.validMonth - 1, 1) : new Date();

export default function CouponsPage() {
  const router = useRouter();
  const [month, setMonth] = useState(dayjs());
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EditingCoupon>(null);

  const fetchCoupons = async (target = month) => {
    setLoading(true);
    try {
      const res = await post<ICouponSearchReq, ICouponSearchRes>('/api/coupon/search', {
        year: target.year(),
        month: target.month() + 1,
        includeEmpty: true,
      });
      setCoupons(res.coupons);
    } catch (error) {
      Toast.show({ content: `查询失败: ${(error as any)?.result ?? error}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCoupons(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const openCreate = () => {
    setEditing(null);
    setModalVisible(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setModalVisible(true);
  };

  const saveCoupon = async (values: { name: string; type?: string; amount: string; validAt: Date }) => {
    const validAt = dayjs(values.validAt);
    const amount = Number(values.amount);
    try {
      if (editing) {
        await post<ICouponUpdateReq, ICouponUpdateRes>('/api/coupon/update', {
          id: editing.id,
          name: values.name,
          type: values.type,
          amount,
          validYear: validAt.year(),
          validMonth: validAt.month() + 1,
        });
        Toast.show({ content: '已保存' });
      } else {
        await post<ICouponCreateReq, ICouponCreateRes>('/api/coupon/create', {
          name: values.name,
          type: values.type,
          amount,
          validYear: validAt.year(),
          validMonth: validAt.month() + 1,
        });
        Toast.show({ content: '已创建' });
      }
      setModalVisible(false);
      await fetchCoupons(month);
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const deleteCoupon = async (coupon: Coupon) => {
    const ok = await Dialog.confirm({ title: '删除券', content: `确认删除「${coupon.name}」吗？已用交易会保留抵扣记录。` });
    if (!ok) return;
    try {
      await post<ICouponDeleteReq, { id: number }>('/api/coupon/delete', { id: coupon.id });
      Toast.show({ content: '已删除' });
      await fetchCoupons(month);
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  const seedCoupons = async () => {
    const ok = await Dialog.confirm({ title: '生成默认券', content: '将生成 2026-01 到 2031-01 的运动券和自由经费券，已存在的不会重复生成。' });
    if (!ok) return;
    try {
      const res = await post<null, ICouponSeedRes>('/api/coupon/seed');
      Toast.show({ content: `新增 ${res.created} 张，跳过 ${res.skipped} 张` });
      await fetchCoupons(month);
    } catch (error) {
      Toast.show({ content: `生成失败: ${(error as any)?.result ?? error}` });
    }
  };

  return (
    <div className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        券管理
      </NavBar>

      <div className={styles.toolbar}>
        <DatePicker
          precision="month"
          value={month.toDate()}
          onConfirm={(value) => setMonth(dayjs(value))}
        >
          {(value, actions) => (
            <Button size="small" onClick={actions.open}>
              {value ? dayjs(value).format('YYYY 年 M 月') : '选择月份'}
            </Button>
          )}
        </DatePicker>
        <Button size="small" color="primary" onClick={openCreate}>
          <AddCircleOutline /> 新建
        </Button>
        <Button size="small" onClick={seedCoupons}>
          生成默认券
        </Button>
      </div>

      {coupons.length > 0 ? (
        <List className={styles.list}>
          {coupons.map((coupon) => {
            return (
              <List.Item
                key={coupon.id}
                extra={
                  <div className={styles.actions}>
                    <Button size="mini" onClick={() => openEdit(coupon)}>
                      <EditSOutline />
                    </Button>
                    <Button size="mini" color="danger" fill="outline" onClick={() => deleteCoupon(coupon)}>
                      <DeleteOutline />
                    </Button>
                  </div>
                }
              >
                <div className={styles.itemTitle}>
                  <PayCircleOutline />
                  <span>{coupon.name}</span>
                  <span>{coupon.validYear}/{String(coupon.validMonth).padStart(2, '0')}</span>
                </div>
                <div className={styles.itemMeta}>
                  剩余 {formatMoney(coupon.remainingAmount)}（总：{formatMoney(coupon.amount)}）
                </div>
              </List.Item>
            );
          })}
        </List>
      ) : (
        <Empty style={{ padding: '64px 0' }} description={loading ? '加载中' : '该月份暂无券'} />
      )}

      <CouponModal
        key={editing?.id ?? 'create'}
        visible={modalVisible}
        coupon={editing}
        onClose={() => setModalVisible(false)}
        onSave={saveCoupon}
      />
    </div>
  );
}

const CouponModal: React.FC<{
  visible: boolean;
  coupon: EditingCoupon;
  onClose: () => void;
  onSave: (values: { name: string; type?: string; amount: string; validAt: Date }) => Promise<void>;
}> = ({ visible, coupon, onClose, onSave }) => (
  <Modal
    visible={visible}
    title={coupon ? '修改券' : '新建券'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{
          name: coupon?.name ?? '',
          type: coupon?.type ?? '',
          amount: coupon?.amount ? String(coupon.amount) : '',
          validAt: toMonthDate(coupon),
        }}
        footer={
          <Button block type="submit" color="primary">
            保存
          </Button>
        }
        onFinish={onSave}
      >
        <Form.Item name="name" label="名字" rules={[{ required: true, message: '请输入名字' }]}>
          <Input placeholder="如 运动券" />
        </Form.Item>
        <Form.Item name="type" label="类型">
          <Input placeholder="可选，如 sport" />
        </Form.Item>
        <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
          <Input placeholder="如 200" type="number" />
        </Form.Item>
        <Form.Item
          name="validAt"
          label="月份"
          trigger="onConfirm"
          onClick={(e, ref: RefObject<DatePickerRef>) => ref.current?.open()}
        >
          <DatePicker precision="month">
            {(value) => (value ? dayjs(value).format('YYYY / MM') : '请选择月份')}
          </DatePicker>
        </Form.Item>
      </Form>
    }
  />
);
