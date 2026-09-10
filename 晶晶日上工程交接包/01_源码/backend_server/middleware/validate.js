// middleware/validate.js - 参数校验中间件
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body?.[field] ?? req.query?.[field] ?? req.params?.[field];
      for (const rule of rules) {
        const result = rule(field, value);
        if (result) errors.push(result);
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ code: 400, message: errors[0], errors });
    }
    next();
  };
}

const v = {
  required: (f, val) => (val === undefined || val === null || val === '' ? `${f}不能为空` : null),
  string: (f, val) => (val !== undefined && val !== null && typeof val !== 'string' ? `${f}必须是字符串` : null),
  number: (f, val) => (val !== undefined && val !== null && typeof val !== 'number' ? `${f}必须是数字` : null),
  integer: (f, val) => (val !== undefined && !Number.isInteger(val) ? `${f}必须是整数` : null),
  positive: (f, val) => (val !== undefined && val !== null && val <= 0 ? `${f}必须大于0` : null),
  phone: (f, val) => (val && !/^1[3-9]\d{9}$/.test(val) ? `${f}格式不正确` : null),
  email: (f, val) => (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? `${f}格式不正确` : null),
  enum: (...allowed) => (f, val) => (val !== undefined && !allowed.includes(val) ? `${f}必须是${allowed.join('/')}` : null),
  maxLen: n => (f, val) => (val && String(val).length > n ? `${f}长度不能超过${n}` : null),
  min: n => (f, val) => (val !== undefined && val !== null && val < n ? `${f}不能小于${n}` : null),
};

module.exports = { validate, v };
