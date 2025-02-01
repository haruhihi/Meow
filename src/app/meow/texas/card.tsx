import { ECardNum, ECardType } from './help';

export const Card: React.FC<{ isShow?: boolean; num: ECardNum; type: ECardType }> = (props) => {
  const { isShow = true, num, type } = props;
  if (isShow) {
    <img height="40px" width="50px" src={`/poker/${num}_of_${type}.svg`} alt="1" />;
  }
  return <img height="40px" width="50px" src={`/poker/cover.svg`} alt="1" />;
};
