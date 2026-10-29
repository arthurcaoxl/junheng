import { Link } from "react-router";
import { SevenDayCheckIn } from "../components/SevenDayCheckIn";

export default function CheckInPage() {
  return (
    <>
      <nav className="check-in-page-nav" aria-label="打卡页导航">
        <Link to="/">← 返回首页</Link>
      </nav>
      <SevenDayCheckIn />
    </>
  );
}
