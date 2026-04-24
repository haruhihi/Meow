'use client';
import {
  FloatingBubble,
  Modal,
  Form,
  Button,
  Input,
  SwipeAction,
  Toast,
  Dialog,
  Cascader,
  CascaderOption,
  Tag,
} from 'antd-mobile';
import { AddCircleOutline, DownOutline, RightOutline } from 'antd-mobile-icons';
import { useMemo, useState } from 'react';
import { getCategoryOptions, useCategories, primeCategoryResolvers, getIconByCategoryName } from '@utils/category';
import {
  ICategoryCreateReq,
  ICategoryCreateRes,
  ICategoryMergeReq,
  ICategoryMergeRes,
  ICategoryDeleteReq,
  ICategoryDeleteRes,
  ICategoryRes,
} from '@dtos/meow';
import { post } from '@libs/fetch';
import { FormCascader } from '@components/form-cascader';
import { TopLoading } from '@components/loading';
import { getCategoryColorByName } from '@styles/theme';
import styles from './category.module.scss';

type Cat = ICategoryRes['categories'][number];

export default function App() {
  const [createVisible, setCreateVisible] = useState(false);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<Cat | null>(null);
  const [mergeCascaderVisible, setMergeCascaderVisible] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const categoryRes = useCategories();

  const tree = useMemo(() => {
    if (!categoryRes) return [] as (Cat & { children: Cat[] })[];
    const byParent = new Map<number | null, Cat[]>();
    categoryRes.categories.forEach((c) => {
      const arr = byParent.get(c.parentId) ?? [];
      arr.push(c);
      byParent.set(c.parentId, arr);
    });
    const build = (parentId: number | null): (Cat & { children: Cat[] })[] =>
      (byParent.get(parentId) ?? [])
        .sort((a, b) => a.id - b.id)
        .map((c) => ({ ...c, children: build(c.id) as Cat[] }));
    return build(null);
  }, [categoryRes]);

  if (!categoryRes) return <TopLoading />;
  primeCategoryResolvers(categoryRes.categories);

  const cascaderOptions = getCategoryOptions(categoryRes.categories);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onMerge = async (fromId: number, toPath: string[]) => {
    const toId = Number(toPath[toPath.length - 1]);
    if (!toId || toId === fromId) {
      Toast.show({ content: '请选择不同的目标类目', position: 'bottom' });
      return;
    }
    const confirm = await Dialog.confirm({
      title: '确认合并',
      content: '此操作会把该类目下的所有账单、预算迁移到目标类目，子类也会一并挂到目标类目下，原类目随后被删除。操作不可撤销。',
    });
    if (!confirm) return;
    try {
      const res = await post<ICategoryMergeReq, ICategoryMergeRes>('/api/category/merge', { fromId, toId });
      Toast.show({
        content: `合并完成：迁移账单 ${res.movedTransactions} 笔，子类 ${res.movedChildren} 个`,
        afterClose: () => categoryRes.reQuery(),
      });
    } catch (err) {
      Toast.show({ content: `合并失败: ${(err as any)?.result ?? err}` });
    }
  };

  const onDelete = async (cat: Cat) => {
    const confirm = await Dialog.confirm({
      title: '删除类目',
      content: `删除 "${cat.name}" ? 只能删除无子类、无账单、无预算的类目。`,
    });
    if (!confirm) return;
    try {
      await post<ICategoryDeleteReq, ICategoryDeleteRes>('/api/category/delete', { id: cat.id });
      Toast.show({ content: '已删除', afterClose: () => categoryRes.reQuery() });
    } catch (err) {
      Toast.show({ content: `${(err as any)?.result ?? err}` });
    }
  };

  const renderNode = (node: Cat & { children: Cat[] }, depth: number) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const color = getCategoryColorByName(depth === 0 ? node.name : undefined) || 'var(--meow-text-muted)';
    const Icon = depth === 0 ? getIconByCategoryName(node.name) : null;
    return (
      <div key={node.id}>
        <SwipeAction
          rightActions={[
            {
              key: 'merge',
              text: '合并',
              color: 'primary',
              onClick: () => {
                setMergeTarget(node);
                setMergeCascaderVisible(true);
              },
            },
            {
              key: 'delete',
              text: '删除',
              color: 'danger',
              onClick: () => onDelete(node),
            },
          ]}
        >
          <div
            className={styles.row}
            style={{ paddingLeft: 16 + depth * 18 }}
            onClick={() => hasChildren && toggle(node.id)}
          >
            <span className={styles.chevron}>
              {hasChildren ? (isExpanded ? <DownOutline /> : <RightOutline />) : <span className={styles.chevronDot} />}
            </span>
            {Icon ? (
              <span className={styles.icon} style={{ background: color + '22', color }}>
                <Icon />
              </span>
            ) : (
              <span className={styles.dot} style={{ background: color }} />
            )}
            <span className={styles.name}>{node.name}</span>
            <span className={styles.idTag}>#{node.id}</span>
          </div>
        </SwipeAction>
        {isExpanded && hasChildren && (
          <div>{node.children.map((c) => renderNode(c as Cat & { children: Cat[] }, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Tag color="primary" style={{ marginRight: 6 }}>
          {categoryRes.categories.length}
        </Tag>
        <span className={styles.hint}>左滑类目查看合并/删除操作</span>
      </div>

      <div className={styles.tree}>{tree.map((n) => renderNode(n, 0))}</div>

      <FloatingBubble
        style={{
          '--initial-position-bottom': '100px',
          '--initial-position-right': '24px',
          '--edge-distance': '44px',
          '--background': 'var(--meow-primary)',
        }}
        onClick={() => setCreateVisible(true)}
      >
        <AddCircleOutline fontSize={32} />
      </FloatingBubble>

      {/* Merge target picker */}
      {mergeTarget && (
        <MergeCascader
          visible={mergeCascaderVisible}
          options={cascaderOptions}
          excludeId={mergeTarget.id}
          onClose={() => setMergeCascaderVisible(false)}
          onConfirm={(path) => {
            setMergeCascaderVisible(false);
            const target = mergeTarget;
            setMergeTarget(null);
            if (target) onMerge(target.id, path);
          }}
        />
      )}

      {/* Create modal */}
      <Modal
        visible={createVisible}
        closeOnMaskClick
        showCloseButton
        onClose={() => setCreateVisible(false)}
        content={
          <Form
            layout="horizontal"
            footer={
              <Button block type="submit" color="primary" size="large">
                提交
              </Button>
            }
            style={{ marginTop: 20 }}
            onFinish={async (values: { name: string; parent?: string[] }) => {
              if (!values?.name) return;
              const parentId = values.parent?.[values.parent.length - 1];
              try {
                await post<ICategoryCreateReq, ICategoryCreateRes>('/api/category/create', {
                  name: values.name,
                  parentId: parentId ? Number(parentId) : null,
                });
                Toast.show({
                  content: '添加成功',
                  afterClose: () => {
                    setCreateVisible(false);
                    categoryRes.reQuery();
                  },
                });
              } catch (err) {
                Toast.show({ content: `${(err as any)?.result ?? err}` });
              }
            }}
          >
            <Form.Item name="parent" label="父级">
              <FormCascader
                options={cascaderOptions ?? []}
                categoryVisible={categoryVisible}
                setCategoryVisible={(v: boolean) => setCategoryVisible(v)}
              />
            </Form.Item>
            <Form.Item name="name" label="类名" rules={[{ required: true, message: '类名不能为空' }]}>
              <Input placeholder="为空则创建顶级类目" type="string" />
            </Form.Item>
          </Form>
        }
      />
    </div>
  );
}

// Secondary cascader just for picking a merge target (hides the source
// subtree to avoid merging into itself).
const MergeCascader: React.FC<{
  visible: boolean;
  options: CascaderOption[];
  excludeId: number;
  onClose: () => void;
  onConfirm: (path: string[]) => void;
}> = ({ visible, options, excludeId, onClose, onConfirm }) => {
  const prune = (list: CascaderOption[]): CascaderOption[] =>
    list
      .filter((o) => String(o.value) !== String(excludeId))
      .map((o) => ({ ...o, children: o.children ? prune(o.children) : undefined }));

  return (
    <Cascader
      options={prune(options)}
      visible={visible}
      onClose={onClose}
      onConfirm={(v) => onConfirm(v as string[])}
      title="合并到…"
    />
  );
};
