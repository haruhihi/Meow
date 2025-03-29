// import Tool from '@static/tool.svg';
import React, { useState } from 'react';
// import styles from './index.module.scss';
// import { UpOutlined } from '@ant-design/icons';
// import { Icon } from '../icon';
// import { AI_Tool } from '@prisma/client';
import { items } from './config';
import { Menu, MenuProps } from 'antd';

interface LevelKeysProps {
  key?: string;
  children?: LevelKeysProps[];
}

export const SideBar: React.FC<{
  onClickItem: (v: string[]) => void;
}> = (props) => {
  const { onClickItem } = props;
  const [stateOpenKeys, setStateOpenKeys] = useState<string[]>(['Chatbot', 'Text']);

  const getLevelKeys = (items1: LevelKeysProps[]) => {
    const key: Record<string, number> = {};
    const func = (items2: LevelKeysProps[], level = 1) => {
      items2.forEach((item) => {
        if (item.key) {
          key[item.key] = level;
        }
        if (item.children) {
          func(item.children, level + 1);
        }
      });
    };
    func(items1);
    return key;
  };

  const levelKeys = getLevelKeys(items as LevelKeysProps[]);

  const onOpenChange: MenuProps['onOpenChange'] = (openKeys) => {
    const currentOpenKey = openKeys.find((key) => stateOpenKeys.indexOf(key) === -1);
    // open
    if (currentOpenKey !== undefined) {
      const repeatIndex = openKeys
        .filter((key) => key !== currentOpenKey)
        .findIndex((key) => levelKeys[key] === levelKeys[currentOpenKey]);

      setStateOpenKeys(
        openKeys
          // remove repeat key
          .filter((_, index) => index !== repeatIndex)
          // remove current level all child
          .filter((key) => levelKeys[key] <= levelKeys[currentOpenKey])
      );
    } else {
      // close
      setStateOpenKeys(openKeys);
    }
  };
  return (
    <Menu
      mode="inline"
      defaultSelectedKeys={['All Tools']}
      openKeys={stateOpenKeys}
      onOpenChange={onOpenChange}
      style={{ width: 256 }}
      items={items}
      onClick={(item) => {
        onClickItem(item.keyPath);
      }}
    />
  );
  // return (
  //   <div className={styles.sideBarWrap}>
  //     <ListItem icon={<Tool width="16px" height="16px" />} text="All Tools" appendix={tools.length} />
  //     <div className={styles.label}>
  //       Popular Tools <UpOutlined width={16} height={16} />
  //     </div>
  //     <div>
  //       {CategoryConfig.map((category, index) => {
  //         return <ListItem key={index} icon={category.icon} text={category.label} />;
  //       })}
  //     </div>
  //   </div>
  // );
};

// const ListItem: React.FC<{
//   icon: React.ReactNode | string;
//   text: string;
//   appendix?: React.ReactNode;
//   link?: string;
//   tool?: AI_Tool;
// }> = (props) => {
//   const { icon, text, appendix, link, tool } = props;
//   return (
//     <a className={styles.itemWrap} href={link} target="_blank">
//       <Icon source={icon} className={styles.icon} category1={tool?.category1} />
//       <div className={styles.text}>{text}</div>
//       <div className={styles.appendix}>{appendix}</div>
//     </a>
//   );
// };
