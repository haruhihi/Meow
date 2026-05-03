import { useEffect, useMemo, useState } from 'react';
import { Popup, SearchBar, CascaderOption } from 'antd-mobile';
import { FlatCategoryOption, flattenCategoryOptions } from '@utils/category';
import styles from './form-cascader.module.scss';

export const FormCascader: React.FC<{
  value?: string[];
  onChange?: (value: unknown) => void;
  options: CascaderOption[];
  categoryVisible: boolean;
  setCategoryVisible: (visiable: boolean) => void;
  frequentOptions?: FlatCategoryOption[];
}> = (props) => {
  const {
    value,
    onChange = () => {},
    options,
    categoryVisible,
    setCategoryVisible,
    frequentOptions = [],
  } = props;
  const [keyword, setKeyword] = useState('');
  const flatOptions = useMemo(() => flattenCategoryOptions(options), [options]);
  const groups = useMemo(() => {
    const map = new Map<string, FlatCategoryOption[]>();
    flatOptions.forEach((option) => {
      const current = map.get(option.groupLabel) ?? [];
      current.push(option);
      map.set(option.groupLabel, current);
    });
    return [...map.entries()];
  }, [flatOptions]);
  const filteredOptions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return flatOptions;
    return flatOptions.filter((option) => option.keywords.includes(normalizedKeyword));
  }, [flatOptions, keyword]);

  useEffect(() => {
    if (!categoryVisible) {
      setKeyword('');
    }
  }, [categoryVisible]);

  const handleSelect = (nextValue: string[]) => {
    onChange(nextValue);
    setCategoryVisible(false);
  };

  return (
    <>
      <div className={styles.trigger} onClick={() => setCategoryVisible(true)}>
        <div className={styles.value}>{getLabelsFromValue(options, value)}</div>
      </div>
      <Popup
        visible={categoryVisible}
        onMaskClick={() => setCategoryVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>选择类目</div>
            <button type="button" className={styles.closeBtn} onClick={() => setCategoryVisible(false)}>
              关闭
            </button>
          </div>

          <SearchBar
            value={keyword}
            placeholder="搜索类目"
            onChange={setKeyword}
            className={styles.search}
          />

          {!keyword && frequentOptions.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>常用类目</div>
              <div className={styles.chips}>
                {frequentOptions.map((option) => {
                  const selected = isSameValue(option.value, value);
                  return (
                    <button
                      key={option.value.join('/')}
                      type="button"
                      className={selected ? styles.chipActive : styles.chip}
                      onClick={() => handleSelect(option.value)}
                    >
                      {option.pathLabels.join(' / ')}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {keyword ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>搜索结果</div>
              {filteredOptions.length > 0 ? (
                <div className={styles.resultList}>
                  {filteredOptions.map((option) => {
                    const selected = isSameValue(option.value, value);
                    return (
                      <button
                        key={option.value.join('/')}
                        type="button"
                        className={selected ? styles.resultItemActive : styles.resultItem}
                        onClick={() => handleSelect(option.value)}
                      >
                        <span className={styles.resultLabel}>{option.label}</span>
                        <span className={styles.resultPath}>{option.pathLabels.join(' / ')}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.empty}>没找到匹配的类目</div>
              )}
            </section>
          ) : (
            <div className={styles.groupList}>
              {groups.map(([groupLabel, items]) => (
                <section key={groupLabel} className={styles.section}>
                  <div className={styles.sectionTitle}>{groupLabel}</div>
                  <div className={styles.chips}>
                    {items.map((option) => {
                      const selected = isSameValue(option.value, value);
                      return (
                        <button
                          key={option.value.join('/')}
                          type="button"
                          className={selected ? styles.chipActive : styles.chip}
                          onClick={() => handleSelect(option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </Popup>
    </>
  );
};

const isSameValue = (left?: string[], right?: string[]) => {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
};

const getOptionLabel = (label: CascaderOption['label']) => String(label ?? '').replace(/\(子\)$/g, '');

const getLabelsFromValue = (options: CascaderOption[], value?: string[]) => {
  if (!value?.length) {
    return '请选择类别';
  }

  const labels: string[] = [];
  let currentOptions = options;

  for (const val of value) {
    const option = currentOptions.find((opt) => String(opt.value) === val);
    if (!option) {
      break;
    }

    labels.push(getOptionLabel(option.label));
    currentOptions = option.children || [];
  }

  return labels[labels.length - 1] || '请选择类别';
};