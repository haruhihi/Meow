import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import { ICategoryRes } from '@dtos/meow';
import { CascaderOption } from 'antd-mobile';
import { useRefresh } from './tool';
import {
  ShopOutlined,
  CustomerServiceOutlined,
  CoffeeOutlined,
  MedicineBoxOutlined,
  BookOutlined,
  RocketOutlined,
  CarOutlined,
  TeamOutlined,
  AccountBookOutlined,
  HomeOutlined,
  HeartOutlined,
  SkinOutlined,
  GiftOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getCategoryColorByName } from '@styles/theme';

export const useCategories = () => {
  const [res, setRes] = useState<ICategoryRes>();
  const { refreshSignal, refresh } = useRefresh();

  useEffect(() => {
    async function fetchCategory() {
      const res = await post<null, ICategoryRes>('/api/category/search');
      setRes(res);
    }
    fetchCategory();
  }, [refreshSignal]);

  return res
    ? {
        ...res,
        reQuery: () => {
          setRes(undefined);
          refresh();
        },
      }
    : undefined;
};

export const getCategoryFromValue = (value: string, categories?: ICategoryRes['categories']) => {
  if (!categories) return undefined;
  return categories.find((category) => `${category.id}` === value);
};

export const getCategoryOptions = (categories: ICategoryRes['categories']) => {
  // 转换成 options
  const buildCategoryTree = (
    categories: ICategoryRes['categories'],
    parentId: number | null = null
  ): CascaderOption[] => {
    return categories
      .filter((category) => category.parentId === parentId)
      .map((category) => {
        const children = buildCategoryTree(categories, category.id);
        const hasChildren = children.length > 0;
        return {
          value: String(category.id),
          label: hasChildren ? `${category.name}(子)` : category.name,
          children: hasChildren ? children : undefined,
        };
      });
  };

  return buildCategoryTree(categories);
};

// ---------- Icon & color resolution ----------
// Icons are resolved by top-level category NAME (robust to id renumbering).
const ICON_BY_TOP_NAME: Record<string, any> = {
  '餐饮美食': CoffeeOutlined,
  '休闲玩乐': CustomerServiceOutlined,
  '休闲/玩乐/运动': CustomerServiceOutlined,
  '看病买药': MedicineBoxOutlined,
  '教育培训': BookOutlined,
  '酒店旅游': RocketOutlined,
  '日用百货': ShopOutlined,
  '缴费/日用/百货': ShopOutlined,
  '交通出行': CarOutlined,
  '社交':     TeamOutlined,
  '居家缴费': HomeOutlined,
  '运动健身': ThunderboltOutlined,
};

// Build a lookup once per categories payload so we can hop to the top
// ancestor in O(1).
const buildTopNameMap = (categories: ICategoryRes['categories']) => {
  const byId = new Map<number, ICategoryRes['categories'][number]>();
  categories.forEach((c) => byId.set(c.id, c));
  const topName = (id: number): string | undefined => {
    let cur = byId.get(id);
    const seen = new Set<number>();
    while (cur && cur.parentId != null) {
      if (seen.has(cur.id)) return cur.name;
      seen.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur?.name;
  };
  return topName;
};

// Cache the last resolver so components don't rebuild per render.
let cachedResolver: ((id: number) => string | undefined) | null = null;
export const primeCategoryResolvers = (categories: ICategoryRes['categories']) => {
  cachedResolver = buildTopNameMap(categories);
};

export const getIconFromCategoryId = (id: number) => {
  const top = cachedResolver?.(id);
  return (top && ICON_BY_TOP_NAME[top]) || AccountBookOutlined;
};

export const getColorFromCategoryId = (id: number) => {
  const top = cachedResolver?.(id);
  return getCategoryColorByName(top);
};

// Also export icon lookup by name for direct use with category objects.
export const getIconByCategoryName = (name?: string | null) =>
  (name && ICON_BY_TOP_NAME[name]) || AccountBookOutlined;

// Silence unused-import lint when the legacy ids above aren't referenced.
void SkinOutlined;
void HeartOutlined;
void GiftOutlined;

