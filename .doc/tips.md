# 0506 
1. 创建最小权限的sonar账号用于生成token，提供服务

# 0507
1. SonarQube CE会自动拉取最新版，但是db不会自动更新，sonar提示正在维护，日志提示如下：
```bash
code-analysis-sq  | 2026.05.07 08:46:15 INFO  web[][o.s.s.p.Platform] Database needs to be migrated. Please refer to https://docs.sonarsource.com/sonarqube-community-build/server-upgrade-and-maintenance/upgrade/roadmap/
```
此时需要在`/setup`手动更新数据库。
因此要么在`.yml`中锁定Sq版本和db版本，要么每次提示时都做一次备份和更新。
```yml
image: sonarqube:26.4.0-community
image: postgres:15.13
```
# 0512

1. 给大模型的issue等切片上下文需要调整
