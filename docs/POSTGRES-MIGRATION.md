# PostgreSQL 迁移检查清单

## 已适配的功能

### ✅ 核心数据库操作
- [x] `collection.illust.findOne()` - 支持
- [x] `collection.illust.find().toArray()` - 支持
- [x] `collection.illust.updateOne()` - 支持（含 $set, upsert）
- [x] `collection.illust.insertOne()` - 支持
- [x] `collection.illust.createIndex()` - 支持（schema.sql 中已创建）

### ✅ 查询条件支持
- [x] `$or` 条件查询（PostgresCursor:666-677）
- [x] `tags` 精确匹配查询（PostgresCursor:694-698）
- [x] `tags.$regex` 正则查询（PostgresCursor:682-693）
- [x] `subscribe_author_list.${authorId}: { $exists: true }` 查询（ChatSettingCursor:782-807）

### ✅ Chat Setting 操作
- [x] `collection.chat_setting.findOne()` - 支持，包括订阅查询
- [x] `collection.chat_setting.find().toArray()` - 支持，处理 id + 订阅组合查询
- [x] `collection.chat_setting.updateOne()` - 支持（扁平化处理）
- [x] `update_setting()` - 完整支持（add_/del_ 前缀）
- [x] `delete_setting()` - 支持

### ✅ 其他 Collection
- [x] `collection.novel` - findOne, insertOne
- [x] `collection.ranking` - findOne, insertOne（JSONB 存储）
- [x] `collection.author` - findOne, updateOne
- [x] `collection.telegraph` - findOne, insertOne

### ✅ 数据重组
- [x] `illust_image` → `imgs_` 对象（rebuildIllustObject）
- [x] `ugoira_meta` → `imgs_` 对象（rebuildIllustObject）
- [x] 扁平化字段 → 嵌套对象（rebuildSettingObject）
- [x] 订阅关系表 → `subscribe_author_list` 对象
- [x] 链接聊天表 → `link_chat_list` 对象

### ✅ 特殊功能
- [x] DBLESS 模式兼容
- [x] author 自动创建（ON CONFLICT DO NOTHING）
- [x] tg_file_id 存储（illust_image 和 ugoira_meta）

## 已检查的使用场景

### ✅ Inline Query 搜索
- **文件**: `app.js:974-1040`
- **查询**: `col.find({ tags: searchTerm }).sort().skip().limit().toArray()`
- **状态**: ✅ 已支持（PostgresCursor 处理）

### ✅ 用户订阅功能
- **文件**: `handlers/telegram/user.js`
- **查询**:
  - `findOne({ 'subscribe_author_list.${authorId}': { $exists: true }, id: chat_id })`
  - `find({ 'subscribe_author_list.${authorId}': { $exists: true }, id: chat_id }).toArray()`
- **状态**: ✅ 已支持（createChatSettingCollection 处理）

### ✅ IllustService 缓存
- **文件**: `handlers/pixiv/illust-service.js`
- **操作**: `updateOne({ id }, { $set: dbData }, { upsert: true })`
- **状态**: ✅ 已支持

### ✅ User 批量查询
- **文件**: `handlers/pixiv/user.js:59-65`
- **查询**: `find({ $or: [{ id: 1 }, { id: 2 }] }).toArray()`
- **状态**: ✅ 已支持（PostgresCursor 处理 $or）

## 不需要适配的功能

### ⚠️ update.js 脚本
- **说明**: 这些脚本用于 MongoDB 数据迁移/清理，不在 PostgreSQL 环境下运行
- **文件**: `update.js`
- **操作**: `find({ storage_endpoint: { $exists: true } })` 等
- **状态**: ⚠️ 仅用于 MongoDB 环境，PostgreSQL 不需要

### ⚠️ Initial.js
- **文件**: `initial.js`
- **操作**: `createIndex()`
- **状态**: ✅ 所有索引在 schema.sql 中定义，createIndex() 返回 true 即可

## 性能优化建议

### 已优化
1. ✅ `illust.tags` - GIN 索引（schema.sql:56）
2. ✅ `illust.author_id` - B-tree 索引（schema.sql:55）
3. ✅ `illust_image.illust_id` - B-tree 索引（schema.sql:88）

### 可能的性能问题

#### 1. Inline Query 搜索
- **当前实现**: 精确匹配 tags 数组元素
- **查询**: `WHERE searchTerm = ANY(i.tags)`
- **索引**: GIN 索引已覆盖
- **预期性能**: ✅ 良好

#### 2. PostgresCursor.toArray() 中的 N+1 查询
- **文件**: `db.js:743-761`
- **问题**: 对每个 illust 单独查询 illust_image 和 ugoira_meta
- **影响**: 当 inline query 返回多个结果时可能较慢
- **建议优化**:
  ```sql
  -- 改用 JOIN 和 GROUP BY
  SELECT i.*, a.author_name,
         json_agg(img ORDER BY img.page_index) as images
  FROM illust i
  LEFT JOIN author a ON i.author_id = a.author_id
  LEFT JOIN illust_image img ON i.id = img.illust_id
  WHERE ...
  GROUP BY i.id, a.author_name
  ```

#### 3. ChatSettingCursor.toArray() 中的 N+1 查询
- **文件**: `db.js:805-820`
- **问题**: 对每个 chat_setting 单独查询订阅和链接
- **影响**: 订阅查询较少使用，影响不大
- **状态**: 🟡 可接受，但可优化

## 待测试功能

- [ ] 运行 `node initial.js` 创建目录和索引
- [ ] 运行 `node mongodb2pg.js` 迁移数据
- [ ] 测试 inline query 搜索标签
- [ ] 测试订阅作者功能
- [ ] 测试链接聊天功能
- [ ] 测试 ugoira 转换和缓存
- [ ] 测试多页作品发送
- [ ] 性能压测

## 潜在问题

### 1. author_name 缺失
- **问题**: `rebuildIllustObject()` 中使用 `illust.author_name`，但 illust 表没有这个字段
- **影响**: 需要 JOIN author 表获取 author_name
- **当前状态**: ⚠️ PostgresCursor.toArray() 已使用 LEFT JOIN（db.js:658）
- **解决方案**: ✅ 已修复

### 2. _id 字段
- **问题**: MongoDB 的 `_id` 字段在代码中被 `delete illust._id` 删除
- **影响**: PostgreSQL 不返回 `_id`，无需删除
- **状态**: ✅ 无影响

### 3. 事务处理
- **问题**: `illust.updateOne()` 使用 BEGIN/COMMIT 事务
- **状态**: ✅ 已实现（db.js:97, 191）

## 配置文件更新

- [x] `config_sample.js` - 添加 postgres 配置
- [x] `package.json` - 添加 pg 依赖
- [x] `db.js` - 完全替换为 PostgreSQL 实现

## 迁移步骤

1. **安装依赖**
   ```bash
   pnpm install
   ```

2. **创建 PostgreSQL 数据库**
   ```bash
   createdb pixiv_bot
   psql pixiv_bot < schema.sql
   ```

3. **配置数据库连接**
   ```javascript
   // config.js
   export default {
       postgres: {
           uri: "postgresql://user:password@localhost:5432/pixiv_bot"
       },
       // ...
   }
   ```

4. **迁移数据**
   ```bash
   node mongodb2pg.js
   ```

5. **初始化目录**
   ```bash
   node initial.js
   ```

6. **启动 bot**
   ```bash
   pnpm all
   ```

## 总结

所有核心功能已完成 PostgreSQL 适配，主要改动：
1. ✅ 数据库层完全重写（db.js）
2. ✅ MongoDB API 模拟（collection wrappers）
3. ✅ 数据结构转换（rebuild 函数）
4. ✅ 查询条件转换（$or, $regex, $exists）
5. ✅ Schema 定义（schema.sql）
6. ✅ 迁移脚本（mongodb2pg.js）

应用层代码无需修改，保持完全兼容。
