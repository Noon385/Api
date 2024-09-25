const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const app = express();
const bcrypt = require('bcrypt');
app.use(express.json());

const config = {
  user: 'sa',
  password: 'nekochan',
  server: 'localhost',      // Địa chỉ SQL Server
  database: 'Nekochandb',
  options: {
    encrypt: true,                   // Sử dụng SSL
    trustServerCertificate: true,    // Chấp nhận chứng chỉ tự ký
    port: 1433                       // Cổng kết nối SQL Server
  }
};

// Kết nối với SQL Server
sql.connect(config).then(pool => {
  console.log('Connected to SQL Server');

  // Lấy mèo từ DB
  app.get('/cats', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM cat_table', (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).send(err);
      } else {
        res.json(result.recordset);
      }
    });
  });

  // Thêm mèo vào DB với hình ảnh nhị phân
  app.post('/addcat', (req, res) => {
    const { cat_name, cat_status, cat_image } = req.body; // cat_image sẽ là dữ liệu nhị phân (base64 hoặc array of bytes)
    const request = pool.request();

    // Kiểm tra nếu tên mèo hoặc tình trạng mèo bị thiếu
    if (!cat_name || !cat_status || !cat_image) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }

    // Chuyển đổi dữ liệu base64 của hình ảnh thành binary nếu cần
    const catImageBinary = Buffer.from(cat_image, 'base64'); // Nếu hình ảnh được gửi dưới dạng base64

    // Thực hiện câu truy vấn để thêm mèo vào bảng
    request.input('cat_name', sql.NVarChar, cat_name)
      .input('cat_status', sql.NVarChar, cat_status)
      .input('cat_image', sql.VarBinary, catImageBinary)
      .query('INSERT INTO cat_table (cat_name, cat_status, cat_image) VALUES (@cat_name, @cat_status, @cat_image)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm mèo:', err);  // Log chi tiết lỗi
          return res.status(500).send('Lỗi hệ thống: ' + err.message); // Gửi lại chi tiết lỗi
        } else {
          res.status(200).json({ message: 'Thêm mèo thành công' });
        }
      });
  });


  // Lấy nhân viên từ DB
  app.get('/users', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM user_table', (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).send(err);
      } else {
        res.json(result.recordset);
      }
    });
  });

  //Login
  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const request = pool.request();

    // Kiểm tra thông tin đăng nhập trong CSDL
    request.input('username', sql.NVarChar, username)
      .query('SELECT * FROM user_table WHERE username = @username', (err, result) => {
        if (err) {
          console.log(err);
          res.status(500).send('Lỗi hệ thống');
        } else {
          if (result.recordset.length === 0) {
            // Không tìm thấy người dùng
            res.status(401).send('Không tìm thấy người dùng');
          } else {
            const user = result.recordset[0];
            
            // So sánh mật khẩu 
            if (password === user.password) {
              res.status(200).send("Login successful");
              console.log(user);
            }
            else {
              res.status(401).send("Fail to login");
            }
            
          }
        }
      });
  });



}).catch(err => {
  console.error('Error connecting to the database:', err);
});

// Lắng nghe cổng
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
