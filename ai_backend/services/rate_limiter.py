"""
基本调用限流器（滑动窗口计数）
按客户端 IP 限制时间窗口内的请求次数，防止滥用。
说明：进程内存实现，适用于单实例本地开发/演示；多实例部署需替换为 Redis 方案。
"""
import time
from collections import defaultdict, deque

from config import settings


class RateLimiter:
    def __init__(self, max_requests: int = None, window_seconds: int = None):
        self.max_requests = max_requests or settings.RATE_LIMIT_MAX
        self.window_seconds = window_seconds or settings.RATE_LIMIT_WINDOW
        # ip -> deque[timestamp]
        self._records: dict = defaultdict(deque)

    def check(self, client_ip: str) -> bool:
        """
        检查该 IP 在窗口内是否超过限额。
        返回 True 表示允许，False 表示已限流。
        """
        now = time.time()
        window_start = now - self.window_seconds
        dq = self._records[client_ip]

        # 清除窗口外的旧记录
        while dq and dq[0] < window_start:
            dq.popleft()

        if len(dq) >= self.max_requests:
            return False

        dq.append(now)
        return True


# 全局单例
rate_limiter = RateLimiter()