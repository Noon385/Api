const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const app = express();
const axios =require('axios');
const bcrypt = require('bcrypt');
const multer = require('multer');
//config multer
const storage = multer.memoryStorage(); // Lưu hình ảnh trong bộ nhớ
const upload = multer({ storage: storage });

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//config server
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

// Lấy doanh thu theo ngày
// app.get('/revenue', async (req, res) => {
//   try {
//     // Sử dụng pool đã kết nối
//     const result = await pool.request().query(`
//       SELECT 
//         CAST(o.order_time AS DATE) AS order_date,  -- Lấy ngày từ order_time
//         SUM(od.total) AS total_revenue             -- Tổng doanh thu
//       FROM 
//         dbo.[order] o
//       JOIN 
//         dbo.order_detail od ON o.order_id = od.order_id
//       WHERE 
//         o.order_status = 'yes'                    -- Lọc đơn hàng đã hoàn thành (nếu cần)
//       GROUP BY 
//         CAST(o.order_time AS DATE)                -- Nhóm theo ngày
//       ORDER BY 
//         order_date ASC;
//     `);

//     // Trả về dữ liệu dưới dạng JSON
//     res.status(200).json(result.recordset);
//   } catch (err) {
//     console.error('Error fetching revenue:', err);
//     res.status(500).send('Lỗi hệ thống');
//   }
// });
app.get('/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Kiểm tra nếu có tham số startDate và endDate
    let query = `
      SELECT 
        CAST(o.order_time AS DATE) AS order_date,  -- Lấy ngày từ order_time
        SUM(od.total) AS total_revenue             -- Tổng doanh thu
      FROM 
        dbo.[order] o
      JOIN 
        dbo.order_detail od ON o.order_id = od.order_id
      WHERE 
        o.order_status = 'yes'                    -- Lọc đơn hàng đã hoàn thành
    `;

    // Thêm điều kiện lọc theo khoảng ngày nếu tồn tại
    if (startDate && endDate) {
      query += ` AND CAST(o.order_time AS DATE) BETWEEN @startDate AND @endDate `;
    }

    query += `
      GROUP BY 
        CAST(o.order_time AS DATE)                -- Nhóm theo ngày
      ORDER BY 
        order_date ASC;
    `;

    // Sử dụng pool đã kết nối
    const request = pool.request();

    // Gán tham số cho truy vấn nếu có
    if (startDate && endDate) {
      request.input('startDate', startDate);
      request.input('endDate', endDate);
    }

    const result = await request.query(query);

    // Chuyển đổi định dạng ngày trả về (nếu cần)
    const formattedResults = result.recordset.map(item => {
      return {
        ...item,
        order_date: item.order_date.toISOString().split('T')[0]  // Chuyển đổi thành yyyy-MM-dd
      };
    });

    // Trả về dữ liệu dưới dạng JSON
    res.status(200).json(formattedResults);
  } catch (err) {
    console.error('Error fetching revenue:', err);
    res.status(500).send('Lỗi hệ thống');
  }
});


//lấy bestseller
app.get('/bestseller', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Cập nhật câu truy vấn để lấy tên món
    let query = `
      SELECT 
        d.drink_name,                                -- Lấy tên món từ bảng drink
        SUM(od.amount) AS total_amount              -- Tổng số lượng bán được
      FROM 
        dbo.order_detail od
      JOIN 
        dbo.[order] o ON od.order_id = o.order_id
      JOIN 
        dbo.drink d ON od.drink_id = d.drink_id     -- Kết hợp với bảng drink để lấy tên
      WHERE 
        o.order_status = 'yes'                      -- Lọc đơn hàng đã hoàn thành
    `;

    // Thêm điều kiện lọc theo khoảng ngày nếu tồn tại
    if (startDate && endDate) {
      query += ` AND CAST(o.order_time AS DATE) BETWEEN @startDate AND @endDate `;
    }

    query += `
      GROUP BY 
        d.drink_name                                -- Nhóm theo tên món
      ORDER BY 
        total_amount DESC;                          -- Sắp xếp theo tổng số lượng bán được giảm dần
    `;

    // Sử dụng pool đã kết nối
    const request = pool.request();

    // Gán tham số cho truy vấn nếu có
    if (startDate && endDate) {
      request.input('startDate', startDate);
      request.input('endDate', endDate);
    }

    const result = await request.query(query);

    // Trả về dữ liệu dưới dạng JSON
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Error fetching bestseller:', err);
    res.status(500).send('Lỗi hệ thống');
  }
});

app.get('/bestcats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Update the query to fetch cat names and the total number of times they were ordered
    let query = `
      SELECT 
        c.cat_name,                                  -- Get the cat name from the cat table
        COUNT(o.cat_id) AS cat_amount              -- Count how many times each cat was ordered
      FROM 
        dbo.order_detail od
      JOIN dbo.[order] o ON od.order_id = o.order_id
      JOIN dbo.cat c ON o.cat_id = c.cat_id          -- Join with the cat table to get the cat name
      WHERE 
        o.order_status = 'yes'                       -- Filter completed orders
    `;

    // Add date filter if both startDate and endDate are provided
    if (startDate && endDate) {
      query += ` AND CAST(o.order_time AS DATE) BETWEEN @startDate AND @endDate `;
    }

    query += `
      GROUP BY 
        c.cat_name                                  -- Group by cat name
      ORDER BY 
        cat_amount DESC;                        
    `;

    // Use the pool connection
    const request = pool.request();

    // Bind parameters for the query
    if (startDate && endDate) {
      request.input('startDate', startDate);
      request.input('endDate', endDate);
    }

    const result = await request.query(query);

    // Return the data as JSON
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Error fetching bestseller cats:', err);
    res.status(500).send('System error');
  }
});


//API thanh toán  momo
app.post('/payment', async (req, res) => {
  const { order_id, total_price } = req.body;

var accessKey = 'F8BBA842ECF85';
var secretKey = 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
var orderInfo = 'Thanh toán bằng Momo';
var partnerCode = 'MOMO';
var redirectUrl = 'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';
var ipnUrl = 'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';
var requestType = "payWithMethod";
var amount = total_price;
var orderId = order_id+total_price;
var requestId = orderId;
var extraData ='';
//var paymentCode = 'T8Qii53fAXyUftPV3m9ysyRhEanUs9KlOPfHgpMR0ON50U10Bh+vZdpJU7VY4z+Z2y77fJHkoDc69scwwzLuW5MzeUKTwPo3ZMaB29imm6YulqnWfTkgzqRaion+EuD7FN9wZ4aXE1+mRt0gHsU193y+yxtRgpmY7SDMU9hCKoQtYyHsfFR5FUAOAKMdw2fzQqpToei3rnaYvZuYaxolprm9+/+WIETnPUDlxCYOiw7vPeaaYQQH0BF0TxyU3zu36ODx980rJvPAgtJzH1gUrlxcSS1HQeQ9ZaVM1eOK/jl8KJm6ijOwErHGbgf/hVymUQG65rHU2MWz9U8QUjvDWA==';
var orderGroupId ='';
var autoCapture =true;
var lang = 'vi';

//before sign HMAC SHA256 with format
//accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
var rawSignature = "accessKey=" + accessKey + "&amount=" + amount + "&extraData=" + extraData + "&ipnUrl=" + ipnUrl + "&orderId=" + orderId + "&orderInfo=" + orderInfo + "&partnerCode=" + partnerCode + "&redirectUrl=" + redirectUrl + "&requestId=" + requestId + "&requestType=" + requestType;
//puts raw signature
console.log("--------------------RAW SIGNATURE----------------")
console.log(rawSignature)
//signature
const crypto = require('crypto');
var signature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');
console.log("--------------------SIGNATURE----------------")
console.log(signature)

//json object send to MoMo endpoint
const requestBody = JSON.stringify({
    partnerCode : partnerCode,
    partnerName : "Test",
    storeId : "MomoTestStore",
    requestId : requestId,
    amount : amount,
    orderId : orderId,
    orderInfo : orderInfo,
    redirectUrl : redirectUrl,
    ipnUrl : ipnUrl,
    lang : lang,
    requestType: requestType,
    autoCapture: autoCapture,
    extraData : extraData,
    orderGroupId: orderGroupId,
    signature : signature
});
//Create the HTTPS objects
const options= {
  method: "POST",
  url :"https://test-payment.momo.vn/v2/gateway/api/create",
  headers:{
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody),
  },
  data : requestBody

}
let result;
try {
  result = await axios(options);
  return res.status(200).json(result.data
  //   {
  //   statusCode: 200,
  //   message: "Payment URL generated successfully",
  //   payUrl: payUrl
  // }
);
}catch(error){
  return res.status(500).json({
    statusCode: 500,
    message :"server error"
  });
}

});
  //cập nhật trạng thái hóa đơn
  app.put('/orderstatus/:order_id', (req, res) => {
    const { order_id } = req.params;
    const { order_status } = req.body;
  
    const request = pool.request();
    request
      .input('order_id', sql.Int, order_id)
      .input('order_status', sql.NVarChar, order_status)
      .query(
        'UPDATE [Order] SET order_status = @order_status WHERE order_id = @order_id',
        (err, result) => {
          if (err) {
            console.error('Error updating order:', err);
            return res.status(500).send('Lỗi hệ thống');
          }
  
          if (result.rowsAffected[0] === 0) {
            return res.status(404).send('Không tìm thấy đơn hàng');
          }
  
          res.status(200).json({ message: 'Cập nhật trạng thái đơn hàng thành công' });
        }
      );
  });
  
  
//lấy chi tiết hóa đơn theo mã bàn
app.get('/order/details/:table_id', async (req, res) => {
  const { table_id } = req.params; // Lấy table_id từ URL

  try {
      const request = pool.request();
      // Thêm tham số table_id vào truy vấn
      request.input('table_id', table_id);

      const query = `
      SELECT 
       o.order_id,
       o.order_time,
       t.table_name,
       t.table_id,
       c.cat_name,
       cu.customer_name,
       ISNULL(cu.customer_point, 0) AS customer_point,
       u.username,
       SUM(od.amount) AS total_amount,
       SUM(od.total) AS total_price,
       o.order_status
   FROM 
       dbo.[order] o
   JOIN dbo.[table] t ON o.table_id = t.table_id
   JOIN dbo.cat c ON o.cat_id = c.cat_id
   JOIN dbo.customer cu ON o.customer_id = cu.customer_id
   JOIN dbo.User_table u ON o.user_id = u.user_id
   JOIN dbo.order_detail od ON o.order_id = od.order_id
   WHERE o.order_status = 'no' AND t.table_id = @table_id
   GROUP BY
       o.order_id, 
       o.order_time, 
       t.table_name,
       t.table_id, 
       c.cat_name, 
       cu.customer_name, 
       ISNULL(cu.customer_point, 0),
       u.username, 
       o.order_status;
      `;

      const result = await request.query(query);

      // Trả về dữ liệu JSON
      res.json(result.recordset);
  } catch (err) {
      console.error('Error fetching orders:', err);
      res.status(500).send('Lỗi hệ thống');
  }
});
app.get('/order/:order_id', async (req, res) => {
  const { order_id } = req.params; // Lấy order_id từ URL

  try {
      const request = pool.request();
      // Thêm tham số order_id vào truy vấn
      request.input('order_id', order_id);

      const query = `
      SELECT 
          o.order_id,
          o.order_time,
          t.table_name,
          t.table_id,
          c.cat_name,
          cu.customer_name,
          cu.customer_id,
          ISNULL(cu.customer_point, 0) AS customer_point,
          u.username,
          SUM(od.amount) AS total_amount,
          SUM(od.total) AS total_price,
          o.order_status
      FROM 
          dbo.[order] o
      JOIN dbo.[table] t ON o.table_id = t.table_id
      JOIN dbo.cat c ON o.cat_id = c.cat_id
      JOIN dbo.customer cu ON o.customer_id = cu.customer_id
      JOIN dbo.User_table u ON o.user_id = u.user_id
      JOIN dbo.order_detail od ON o.order_id = od.order_id
      WHERE o.order_id = @order_id
      GROUP BY
          o.order_id, 
          o.order_time, 
          t.table_name,
          t.table_id, 
          c.cat_name, 
          cu.customer_name, 
          cu.customer_id,
          ISNULL(cu.customer_point, 0),
          u.username, 
          o.order_status;
      `;

      const result = await request.query(query);

      if (result.recordset.length === 0) {
          return res.status(404).send('Không tìm thấy đơn hàng.');
      }

      // Trả về dữ liệu JSON
      res.json(result.recordset[0]);
  } catch (err) {
      console.error('Error fetching order by ID:', err);
      res.status(500).send('Lỗi hệ thống');
  }
});

//xóa hóa đơn
app.delete('/orders/:order_id', (req, res) => {
  const { order_id } = req.params;

  // Check if the id parameter is provided
  if (!order_id) {
    return res.status(400).send('Vui lòng cung cấp ID đơn hàng cần xóa');
  }

  // Create a new request instance for deleting order details
  const deleteOrderDetailsRequest = pool.request();
  deleteOrderDetailsRequest.input('order_id', sql.Int, order_id)
    .query('DELETE FROM order_detail WHERE order_id = @order_id', (err, result) => {
      if (err) {
        console.error('Error deleting order details:', err);
        return res.status(500).send('Lỗi hệ thống');
      }

      // After deleting order details, create another request instance for deleting the main order
      const deleteOrderRequest = pool.request();
      deleteOrderRequest.input('order_id', sql.Int, order_id)
        .query('DELETE FROM [order] WHERE order_id = @order_id', (err, result) => {
          if (err) {
            console.error('Error deleting order:', err);
            return res.status(500).send('Lỗi hệ thống');
          }

          if (result.rowsAffected[0] === 0) {
            return res.status(404).send('Không tìm thấy đơn hàng cần xóa');
          }

          res.status(200).json({ message: 'Đơn hàng và chi tiết đơn hàng đã được xóa thành công' });
        });
    });
});


  //Lấy danh sách hóa đơn
  app.get('/orders', async (req, res) => {
    const request = pool.request();
    request.query(`
    SELECT 
    o.order_id,
    o.order_time,
    t.table_name,
    t.table_id,
    c.cat_name,
    cu.customer_name,
    cu.customer_id,
    cu.customer_point,
    u.username,
    SUM(od.amount) AS total_amount,
    SUM(od.total) AS total_price,
    o.order_status
FROM 
    dbo.[order] o
JOIN dbo.[table] t ON o.table_id = t.table_id
JOIN dbo.cat c ON o.cat_id = c.cat_id
JOIN dbo.customer cu ON o.customer_id = cu.customer_id
JOIN dbo.User_table u ON o.user_id = u.user_id
JOIN dbo.order_detail od ON o.order_id = od.order_id
GROUP BY
    o.order_id, 
    o.order_time, 
    t.table_name,
    t.table_id,  -- Add this to the GROUP BY clause
    c.cat_name, 
    cu.customer_name,
    cu.customer_id, 
    cu.customer_point,
    u.username, 
    o.order_status;



      `, (err, result) => {
      if (err) {
        console.log('Error fetching tables:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      res.json(result.recordset);
    });
  });

  //lấy chi tiết hóa đơn
  app.get('/orderdetails/:order_id', async (req, res) => {
    const { order_id } = req.params;
    const request = pool.request();
    console.log("Received order_id:", order_id);

    request.input('order_id', sql.Int, order_id)
        .query(`
            SELECT 
    d.drink_name,
    od.amount,
    d.drink_price
FROM 
    dbo.order_detail od
JOIN 
    Drink d ON od.drink_id = d.drink_id
WHERE 
    od.order_id = @order_id;
        `, (err, result) => {
            if (err) {
                console.log('Error fetching order details:', err);
                return res.status(500).send('Lỗi hệ thống');
            }
            res.json(result.recordset);
        });
});

//thêm order
  // app.post('/addOrder', (req, res) => {
  //   const { table_id, cat_id, customer_id,user_id } = req.body;
  //   if (!table_id ||!cat_id ||!customer_id ||!user_id ) {
  //     return res.status(400).send('Vui lòng cung cấp đủ thông tin');
  //   }
    
  //   const request = pool.request();
  //   request.input('table_id', sql.Int, table_id)
  //     .input('cat_id', sql.Int, cat_id)
  //     .input('customer_id', sql.Int, customer_id)
  //     .input('user_id', sql.Int, user_id)
  //     .query('INSERT INTO [order] (table_id, cat_id,customer_id,user_id) VALUES (@table_id,@cat_id,@customer_id,@user_id)', (err, result) => {
  //       if (err) {
  //         console.log('Error adding order:', err);
  //         return res.status(500).send('Lỗi hệ thống');
  //       }
  //       res.status(201).json({ message: 'Hóa đơn đã được thêm thành công' });
  //     });
  // });

  //them order
app.post('/addOrder', (req, res) => {
  const { table_id, cat_id, customer_id, user_id } = req.body;
  if (!table_id || !cat_id || !customer_id || !user_id) {
    return res.status(400).send('Vui lòng cung cấp đủ thông tin');
  }
  
  const request = pool.request();
  request.input('table_id', sql.Int, table_id)
    .input('cat_id', sql.Int, cat_id)
    .input('customer_id', sql.Int, customer_id)
    .input('user_id', sql.Int, user_id)
    .query(
      `INSERT INTO [order] (table_id, cat_id, customer_id, user_id, order_status,order_time)
       VALUES (@table_id, @cat_id, @customer_id, @user_id, 'no',GETDATE());
       SELECT SCOPE_IDENTITY() AS order_id;`,  
      (err, result) => {
        if (err) {
          console.log('Error adding order:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        const orderId = result.recordset[0].order_id; 
        console.log(orderId);
        res.status(201).json({ message: 'Hóa đơn đã được thêm thành công', order_id: orderId });
      }
    );
});
 

//thêm vào order_detail
app.post('/addOrderDetail', (req, res) => {
  const { order_id, drink_id, amount,total } = req.body;
  if (!order_id ||!drink_id ||!amount ||!total ) {
    return res.status(400).send('Vui lòng cung cấp đủ thông tin');
  }
  const request = pool.request();
  request.input('order_id', sql.Int, order_id)
    .input('drink_id', sql.Int, drink_id)
    .input('amount', sql.Int, amount)
    .input('total', sql.Int, total)
    .query('INSERT INTO dbo.order_detail (order_id ,drink_id ,amount ,total) VALUES (@order_id ,@drink_id ,@amount ,@total)', (err, result) => {
      if (err) {
        console.log('Error adding order:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      res.status(201).json({ message: 'Hóa đơn đã được thêm thành công' });
    });
});

 //Lấy thông tin chi tiết hóa đơn
//  app.get('/orderdetails/:order_id', (req, res) => {
//   const { order_id } = req.params;
//   const request = pool.request();
//   console.log("Received order_id:", order_id);

//   request.input('order_id', sql.Int, order_id)
//       .query('SELECT * FROM dbo.order_detail WHERE order_id = @order_id', (err, result) => {
//           if (err) {
//               console.log('Error fetching order details:', err);
//               return res.status(500).send('Lỗi hệ thống');
//           }
//           res.json(result.recordset);
//       });
// });


  //Lấy danh sách bàn
  app.get('/tables', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM [Table]', (err, result) => {
      if (err) {
        console.log('Error fetching tables:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      res.json(result.recordset);
    });
  });
  // Lấy danh sách bàn trống
app.get('/tablesempty', (req, res) => {
  const request = pool.request();
  request.query("SELECT * FROM [Table] WHERE table_status = 'no'", (err, result) => {
    if (err) {
      console.log('Error fetching tables:', err);
      return res.status(500).send('Lỗi hệ thống');
    }
    res.json(result.recordset);
  });
});


  //Thêm bàn
  app.post('/tables', (req, res) => {
    const { table_name, table_status } = req.body;
    if (!table_name) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const status = table_status || 'no';
    const request = pool.request();
    request.input('table_name', sql.NVarChar, table_name)
      .input('table_status', sql.NVarChar, status)
      .query('INSERT INTO [Table] (table_name, table_status) VALUES (@table_name, @table_status)', (err, result) => {
        if (err) {
          console.log('Error adding table:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        res.status(201).json({ message: 'Bàn đã được thêm thành công' });
      });
  });
  //xóa bàn
  app.delete('/tables/:id', (req, res) => {
    const { id } = req.params;

    // Check if the id parameter is provided
    if (!id) {
      return res.status(400).send('Vui lòng cung cấp ID bàn cần xóa');
    }

    const request = pool.request();
    request.input('table_id', sql.Int, id)
      .query('DELETE FROM [Table] WHERE table_id = @table_id', (err, result) => {
        if (err) {
          console.log('Error deleting table:', err);
          return res.status(500).send('Lỗi hệ thống');
        }

        if (result.rowsAffected[0] === 0) {
          return res.status(404).send('Không tìm thấy bàn cần xóa');
        }

        res.status(200).json({ message: 'Bàn đã được xóa thành công' });
      });
  });
  // cập nhật thông tin bàn
  app.put('/tables/:table_id', (req, res) => {
    const { table_id } = req.params;
    const { table_name } = req.body;

    if (!table_name) {
      return res.status(400).send('Vui lòng cung cấp tên bàn');
    }

    const request = pool.request();
    request
      .input('table_id', sql.Int, table_id)
      .input('table_name', sql.NVarChar, table_name)
      .query(
        'UPDATE [Table] SET table_name = @table_name WHERE table_id = @table_id',
        (err, result) => {
          if (err) {
            console.log('Error updating table:', err);
            return res.status(500).send('Lỗi hệ thống');
          }
          res.status(200).json({ message: 'Cập nhật bàn thành công' });
        }
      );
  });
  //Cập nhật trạng thái bàn khi thanh toán
  app.put('/tablestatus/:table_id', (req, res) => {
    const { table_id } = req.params;
    const { table_status } = req.body;

    const request = pool.request();
    request
      .input('table_id', sql.Int, table_id)
      .input('table_status', sql.NVarChar, table_status)
      .query(
        'UPDATE [Table] SET table_status = @table_status WHERE table_id = @table_id',
        (err, result) => {
          if (err) {
            console.log('Error updating table:', err);
            return res.status(500).send('Lỗi hệ thống');
          }
          res.status(200).json({ message: 'Cập nhật bàn thành công' });
        }
      );
  });
  //cập nhật trạng thái bàn thông qua hóa 
  // lấy danh sách món thông qua categoryid
  app.get('/drinks/category/:categoryId', async (req, res) => {
    const categoryId = req.params.categoryId;
    try {
      const request = pool.request();
      request.input('category_id', sql.Int, categoryId);
      const result = await request.query('SELECT * FROM Drink WHERE category_id = @category_id');
      if (result.recordset.length === 0) {
        return res.status(404).send('Không tìm thấy đồ uống cho loại món này');
      }
      const drinks = result.recordset.map(drink => ({
        drink_id: drink.drink_id,
        drink_name: drink.drink_name,
        drink_status: drink.drink_status,
        drink_price: drink.drink_price,
        category_id: drink.category_id,
        drink_image: drink.drink_image ? Buffer.from(drink.drink_image).toString('base64') : null
      }));
      res.status(200).json(drinks);
    } catch (err) {
      console.log('Lỗi khi lấy danh sách đồ uống theo loại món:', err);
      res.status(500).send('Lỗi hệ thống');
    }
  });
  // lấy danh sách món theo id
  app.get('/drinks/:id', (req, res) => {
    const drinkId = req.params.id;
    const request = pool.request();
    request.input('drinkId', sql.Int, drinkId);
    request.query('SELECT * FROM Drink WHERE drink_id = @drinkId', (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy đồ uống theo ID:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      if (result.recordset.length === 0) {
        return res.status(404).send('Không tìm thấy đồ uống');
      }
      const drink = result.recordset[0];
      const drinkResponse = {
        drink_id: drink.drink_id,
        drink_name: drink.drink_name,
        drink_status: drink.drink_status,
        drink_price: drink.drink_price,
        category_id: drink.category_id,
        drink_image: drink.drink_image ? Buffer.from(drink.drink_image).toString('base64') : null
      };
      res.status(200).json(drinkResponse);
    });
  });
  // lấy danh sách món
  app.get('/drinks', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM Drink', (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy danh sách đồ uống:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      const drinks = result.recordset.map(drink => ({
        drink_id: drink.drink_id,
        drink_name: drink.drink_name,
        drink_status: drink.drink_status,
        drink_price: drink.drink_price,
        category_id: drink.category_id,
        drink_image: drink.drink_image ? Buffer.from(drink.drink_image).toString('base64') : null
      }));
      res.status(200).json(drinks);
    });
  });
  // thêm danh sách đồ uống
  app.post('/drinks', upload.single('drink_image'), (req, res) => {
    const { drink_name, drink_status, drink_price, category_id } = req.body;
    const drink_image = req.file;
    if (!drink_name || !drink_status || !drink_price || !category_id) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const drinkImageBinary = drink_image ? drink_image.buffer : null;
    const request = pool.request();
    request.input('drink_name', sql.NVarChar, drink_name)
      .input('drink_status', sql.NVarChar, drink_status)
      .input('drink_price', sql.Decimal, drink_price)
      .input('category_id', sql.Int, category_id)
      .input('drink_image', sql.VarBinary, drinkImageBinary)
      .query('INSERT INTO Drink (drink_name, drink_status, drink_price, category_id, drink_image) VALUES (@drink_name, @drink_status, @drink_price, @category_id, @drink_image)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm đồ uống:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        res.status(201).json({ message: 'Thêm đồ uống thành công' });
      });
  });
  // sửa danh sách món
  app.put('/drinks/:id', upload.single('drink_image'), (req, res) => {
    const drinkId = req.params.id;
    const { drink_name, drink_status, drink_price, category_id } = req.body;
    const drink_image = req.file;
    const request = pool.request();
    request.input('drink_id', sql.Int, drinkId);
    let updateQuery = 'UPDATE Drink SET ';
    if (drink_name) {
      updateQuery += 'drink_name = @drink_name, ';
      request.input('drink_name', sql.NVarChar, drink_name);
    }
    if (drink_status) {
      updateQuery += 'drink_status = @drink_status, ';
      request.input('drink_status', sql.NVarChar, drink_status);
    }
    if (drink_price) {
      updateQuery += 'drink_price = @drink_price, ';
      request.input('drink_price', sql.Decimal, drink_price);
    }
    if (category_id) {
      updateQuery += 'category_id = @category_id, ';
      request.input('category_id', sql.Int, category_id);
    }
    if (drink_image) {
      updateQuery += 'drink_image = @drink_image, ';
      request.input('drink_image', sql.VarBinary, drink_image.buffer);
    }
    updateQuery = updateQuery.slice(0, -2) + ' WHERE drink_id = @drink_id';
    request.query(updateQuery, (err, result) => {
      if (err) {
        console.log('Lỗi khi cập nhật đồ uống:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      res.status(200).json({ message: 'Cập nhật đồ uống thành công' });
    });
  });
  // xóa danh sách món
  app.delete('/drinks/:id', (req, res) => {
    const drinkId = req.params.id;
    const request = pool.request();
    request.input('drink_id', sql.Int, drinkId)
      .query('DELETE FROM Drink WHERE drink_id = @drink_id', (err, result) => {
        if (err) {
          console.log('Lỗi khi xóa đồ uống:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        if (result.rowsAffected[0] === 0) {
          return res.status(404).send('Không tìm thấy đồ uống');
        }
        res.status(200).json({ message: 'Xóa đồ uống thành công' });
      });
  });
  // API xem loại món
  app.get('/categories', (req, res) => {
    const request = pool.request();
    request.query('SELECT category_id, category_name, category_image FROM Category', (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy danh sách Category:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      const categories = result.recordset.map(category => ({
        category_id: category.category_id,
        category_name: category.category_name,
        category_image: category.category_image ? Buffer.from(category.category_image).toString('base64') : null
      }));
      res.status(200).json(categories);
    });
  });
  // lấy loại món theo id
  app.get('/categories/:categoryId', (req, res) => {
    const { categoryId } = req.params;
    sql.connect(config).then(pool => {
      return pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query('SELECT * FROM Category WHERE category_id = @categoryId');
    }).then(result => {
      if (result.recordset.length === 0) {
        return res.status(404).send('Loại món không tìm thấy');
      }
      const category = result.recordset[0];
      const categoryImageBase64 = category.category_image ? Buffer.from(category.category_image).toString('base64') : null;
      res.status(200).json({
        category_id: category.category_id,
        category_name: category.category_name,
        category_image: categoryImageBase64
      });
    }).catch(err => {
      console.log('Lỗi khi truy vấn dữ liệu:', err);
      res.status(500).send('Lỗi hệ thống: ' + err.message);
    });
  });
  //API xóa loại món
  app.delete('/categories/:id', (req, res) => {
    const categoryId = req.params.id;
    const request = pool.request();
    request.input('category_id', sql.Int, categoryId)
      .query('DELETE FROM Category WHERE category_id = @category_id', (err, result) => {
        if (err) {
          console.log('Lỗi khi xóa Category:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        if (result.rowsAffected[0] === 0) {
          return res.status(404).send('Không tìm thấy loại món');
        }
        res.status(200).json({ message: 'Loại món đã được xóa thành công' });
      });
  });
  // API thêm loại món
  app.post('/categories', upload.single('category_image'), (req, res) => {
    const { category_name } = req.body;
    const category_image = req.file;
    if (!category_name) {
      return res.status(400).send('Vui lòng cung cấp tên loại món');
    }
    const categoryImageBinary = category_image ? category_image.buffer : null;
    const request = pool.request();
    request.input('category_name', sql.NVarChar, category_name)
      .input('category_image', sql.VarBinary, categoryImageBinary)
      .query('INSERT INTO Category (category_name, category_image) VALUES (@category_name, @category_image)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm loại món:', err);
          return res.status(500).send('Lỗi hệ thống: ' + err.message);
        } else {
          res.status(200).json({ message: 'Thêm loại món thành công' });
        }
      });
  });
  // API cập nhật loại món
  app.put('/categories/:id', upload.single('category_image'), (req, res) => {
    const categoryId = req.params.id;
    const { category_name } = req.body;
    const category_image = req.file;
    if (!category_name) {
      return res.status(400).send('Vui lòng cung cấp tên loại món');
    }
    const categoryImageBinary = category_image ? category_image.buffer : null;
    const request = pool.request();
    request.input('category_id', sql.Int, categoryId);
    request.input('category_name', sql.NVarChar, category_name);
    let query = 'UPDATE Category SET category_name = @category_name';
    if (categoryImageBinary) {
      query += ', category_image = @category_image';
      request.input('category_image', sql.VarBinary, categoryImageBinary);
    }
    query += ' WHERE category_id = @category_id';
    request.query(query, (err, result) => {
      if (err) {
        console.log('Lỗi khi cập nhật Category:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      if (result.rowsAffected[0] === 0) {
        return res.status(404).send('Không tìm thấy loại món');
      }
      res.status(200).json({ message: 'Loại món đã được cập nhật thành công' });
    });
  });
  //API lấy thông tin nhân nuôi thông qua Id
  app.get('/adopts/:adopt_id', (req, res) => {
    const adoptId = req.params.adopt_id;
    const request = pool.request();
    request.query(`
    SELECT a.cat_id, a.customer_id
    FROM Adopt a
    WHERE a.adopt_id = ${adoptId}
  `, (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy cat_id và customer_id:', err);
        return res.status(500).send('Lỗi hệ thống: ' + err.message);
      }
      if (result.recordset.length === 0) {
        return res.status(404).send('Không tìm thấy thông tin nhận nuôi với adopt_id đã cho');
      }
      const { cat_id, customer_id } = result.recordset[0];
      res.status(200).json({
        cat_id,
        customer_id
      });
    });
  });
  app.get('/adopts', (req, res) => {
    const request = pool.request();
    request.query(`
    SELECT a.adopt_id, a.adopt_time, c.cat_name, c.cat_status, cu.customer_name ,c.cat_image
    FROM Adopt a
    JOIN Cat c ON a.cat_id = c.cat_id
    JOIN Customer cu ON a.customer_id = cu.customer_id
    ORDER BY a.adopt_time DESC
  `, (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy thông tin nhận nuôi:', err);
        return res.status(500).send('Lỗi hệ thống: ' + err.message);
      }
      const adoptData = result.recordset.map(row => ({
        ...row,
        cat_image: row.cat_image ? Buffer.from(row.cat_image).toString('base64') : null
      }));
      res.status(200).json(adoptData);
    });
  });
  //;ấy thông tin nhận nuôi của customer
  app.get('/adopts/customer/:customer_id', (req, res) => {
    const customerId = req.params.customer_id;
    const request = pool.request();
    request.query(`
      SELECT a.adopt_id, a.adopt_time, c.cat_name, c.cat_status, cu.customer_name, c.cat_image
      FROM Adopt a
      JOIN Cat c ON a.cat_id = c.cat_id
      JOIN Customer cu ON a.customer_id = cu.customer_id
      WHERE a.customer_id = ${customerId}
      ORDER BY a.adopt_time DESC
    `, (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy thông tin nhận nuôi theo customer_id:', err);
        return res.status(500).send('Lỗi hệ thống: ' + err.message);
      }
      const adoptData = result.recordset.map(row => ({
        ...row,
        cat_image: row.cat_image ? Buffer.from(row.cat_image).toString('base64') : null
      }));
      if (adoptData.length === 0) {
        return res.status(404).send('Không tìm thấy thông tin nhận nuôi cho customer_id đã cho');
      }
      res.status(200).json(adoptData);
    });
  });

  // API thêm adopt (nhận nuôi mèo)
  app.post('/adopts', (req, res) => {
    const { cat_id, customer_id } = req.body;
    if (!cat_id || !customer_id) {
      return res.status(400).send('Thiếu thông tin mèo hoặc khách hàng');
    }
    const request = pool.request();
    request.query(`
    SELECT * FROM Cat WHERE cat_id = ${cat_id} AND cat_status = 'At Store'
  `, (err, result) => {
      if (err) {
        console.log('Lỗi khi kiểm tra thông tin mèo:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      if (result.recordset.length === 0) {
        return res.status(400).send('Mèo này không tồn tại hoặc đã được nhận nuôi');
      }
      request.query(`
      INSERT INTO Adopt (adopt_time, cat_id, customer_id) 
      VALUES (GETDATE(), ${cat_id}, ${customer_id})
    `, (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm thông tin nhận nuôi:', err);
          return res.status(500).send('Lỗi hệ thống khi thêm nhận nuôi');
        }
        request.query(`
        UPDATE Cat SET cat_status = 'Adopted' WHERE cat_id = ${cat_id}
      `, (err, result) => {
          if (err) {
            console.log('Lỗi khi cập nhật trạng thái mèo:', err);
            return res.status(500).send('Lỗi khi cập nhật trạng thái mèo');
          }
          res.status(200).send('Nhận nuôi thành công');
        });
      });
    });
  });
  // lấy mèo chưa duco759 nhận nuôi
  app.get('/catsatstore', (req, res) => {
    const request = pool.request();
    const query = "SELECT * FROM Cat WHERE cat_status = 'At Store'";

    request.query(query, (error, result) => {
      if (error) {
        console.log('Lỗi khi lấy danh sách mèo chưa nhận nuôi:', error);
        return res.status(500).send('Lỗi hệ thống: ' + error.message);
      }
      const catsAtStore = result.recordset.map(cat => ({
        cat_id: cat.cat_id,
        cat_name: cat.cat_name,
        cat_status: cat.cat_status,
        cat_image: cat.cat_image ? Buffer.from(cat.cat_image).toString('base64') : null
      }));
      res.status(200).json(catsAtStore);
    });
  });
  // API xóa thông tin nhận nuôi
  app.delete('/adopts/:id', (req, res) => {
    const adoptId = req.params.id;
    const request = pool.request();
    request.query(`
    SELECT cat_id FROM Adopt WHERE adopt_id = ${adoptId}
  `, (err, result) => {
      if (err) {
        console.log('Lỗi khi lấy thông tin mèo:', err);
        return res.status(500).send('Lỗi hệ thống');
      }
      if (result.recordset.length === 0) {
        return res.status(404).send('Không tìm thấy bản ghi nhận nuôi');
      }
      const catId = result.recordset[0].cat_id;
      request.query(`
      DELETE FROM Adopt WHERE adopt_id = ${adoptId}
    `, (err, result) => {
        if (err) {
          console.log('Lỗi khi xóa thông tin nhận nuôi:', err);
          return res.status(500).send('Lỗi hệ thống khi xóa thông tin nhận nuôi');
        }
        request.query(`
        UPDATE Cat SET cat_status = 'At Store' WHERE cat_id = ${catId}
      `, (err, result) => {
          if (err) {
            console.log('Lỗi khi cập nhật trạng thái mèo:', err);
            return res.status(500).send('Lỗi khi cập nhật trạng thái mèo');
          }
          res.status(200).send('Xóa thông tin nhận nuôi thành công');
        });
      });
    });
  });
  // Cập nhật thông tin nhận nuôi
  app.put('/adopts/:id', (req, res) => {
    const adoptId = req.params.id;
    const { cat_id, customer_id } = req.body;
    const request = pool.request();
    if (!cat_id || !customer_id) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin mèo và khách hàng');
    }
    request.query(`SELECT * FROM Adopt WHERE adopt_id = ${adoptId}`, (err, result) => {
      if (err) {
        console.log('Lỗi khi kiểm tra thông tin nhận nuôi:', err);
        return res.status(500).send('Lỗi hệ thống');
      }

      if (result.recordset.length === 0) {
        return res.status(404).send('Không tìm thấy thông tin nhận nuôi');
      }
      request.query(`
      UPDATE Adopt 
      SET cat_id = ${cat_id}, customer_id = ${customer_id}, adopt_time = GETDATE() 
      WHERE adopt_id = ${adoptId}
    `, (err, result) => {
        if (err) {
          console.log('Lỗi khi cập nhật thông tin nhận nuôi:', err);
          return res.status(500).send('Lỗi hệ thống khi cập nhật thông tin nhận nuôi');
        }

        res.status(200).send('Thông tin nhận nuôi đã được cập nhật thành công');
      });
    });
  });
  // Lấy mèo từ DB
  app.get('/cats', (req, res) => {
    const request = pool.request();
    request.query('SELECT cat_id, cat_name, cat_status, cat_image FROM Cat', (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).send(err);
      } else {
        const cats = result.recordset.map(cat => ({
          cat_id: cat.cat_id,
          cat_name: cat.cat_name,
          cat_status: cat.cat_status,
         
          cat_image: cat.cat_image ? Buffer.from(cat.cat_image).toString('base64') : null
        }));
        res.json(cats);
      }
    });
  });
  // Lấy nhân viên từ DB
  app.get('/users', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM User_table ', (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).send(err);
      } else {
        res.json(result.recordset);
      }
    });
  });
  //Lấy user theo id
  app.get('/users/:user_id', (req, res) => {
    const userId = req.params.user_id;
    const request = pool.request();

    request.input('user_id', sql.Int, userId)
      .query('SELECT * FROM User_table WHERE user_id = @user_id', (err, result) => {
        if (err) {
          console.log('Error fetching user by ID:', err);
          res.status(500).send('Lỗi hệ thống');
        } else if (result.recordset.length === 0) {
          res.status(404).send('Không tìm thấy người dùng');
        } else {
          res.json(result.recordset[0]);
        }
      });
  });

  // Thêm nhân viên
  app.post('/users', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const request = pool.request();
    request.input('username', sql.NVarChar, username)
      .input('password', sql.NVarChar, password)
      .input('role', sql.NVarChar, role)
      .query('INSERT INTO User_table (username, password, role) VALUES (@username, @password, @role)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm người dùng:', err);
          return res.status(500).send('Lỗi hệ thống: ' + err.message);
        } else {
          res.status(201).json({ message: 'Người dùng đã được thêm thành công' });
        }
      });
  });
  // Cập nhật thông tin người dùng
  app.put('/users/:id', (req, res) => {
    const userId = req.params.id;
    const { username, password, role } = req.body;
    const request = pool.request();
    request.input('id', sql.Int, userId);
    let updateQuery = 'UPDATE User_table SET ';
    if (username) {
      updateQuery += 'username = @username, ';
      request.input('username', sql.NVarChar, username);
    }
    if (password) {
      updateQuery += 'password = @password, ';
      request.input('password', sql.NVarChar, password);
    }
    if (role) {
      updateQuery += 'role = @role, ';
      request.input('role', sql.NVarChar, role);
    }
    updateQuery = updateQuery.slice(0, -2) + ' WHERE user_id = @id';
    request.query(updateQuery, (err, result) => {
      if (err) {
        console.log('Lỗi khi cập nhật người dùng:', err);
        return res.status(500).send('Lỗi hệ thống: ' + err.message);
      }
      res.status(200).json({ message: 'Người dùng đã được cập nhật thành công' });
    });
  });

  // Xóa người dùng
  app.delete('/users/:id', (req, res) => {
    const userId = req.params.id;
    console.log(userId);
    const request = pool.request();
    request.input('id', sql.Int, userId)
      .query('DELETE FROM User_table WHERE user_id = @id', (err, result) => {
        if (err) {
          console.error('Lỗi khi xóa người dùng:', err);
          return res.status(500).send('Lỗi hệ thống: ' + err.message);
        }
        if (result.rowsAffected[0] === 0) {
          return res.status(404).send('Không tìm thấy người dùng');
        }
        res.status(200).json({ message: 'Người dùng đã được xóa thành công' });
      });
  });
//Lấy hóa đơn theo khách hàng
app.get('/orderByCustomerId/:customer_id', async (req, res) => {
  const customer_id = req.params.customer_id;

  const request = pool.request();
  request.input('customer_id', customer_id); 
  const query = `
    SELECT 
      o.order_id,
      t.table_name,
      c.cat_name,
      cu.customer_name,
      u.username,
      SUM(od.amount) AS total_amount,
      SUM(od.total) AS total_price,
      o.order_status
    FROM 
      dbo.[order] o
    JOIN dbo.[table] t ON o.table_id = t.table_id
    JOIN dbo.cat c ON o.cat_id = c.cat_id
    JOIN dbo.customer cu ON o.customer_id = cu.customer_id
    JOIN dbo.User_table u ON o.user_id = u.user_id
    JOIN dbo.order_detail od ON o.order_id = od.order_id
    JOIN dbo.drink d ON od.drink_id = d.drink_id
    WHERE cu.customer_id = @customer_id  
    GROUP BY
      o.order_id, t.table_name, c.cat_name, cu.customer_name, u.username, o.order_status;
  `;

  request.query(query, (err, result) => {
    if (err) {
      console.log('Error fetching orders:', err);
      return res.status(500).send('Lỗi hệ thống');
    }
    res.json(result.recordset);
  });
});

  // Lấy danh sách khách hàng
  app.get('/customers', (req, res) => {
    const request = pool.request();
    request.query('SELECT * FROM Customer', (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).send('Lỗi hệ thống');
      }
      res.json(result.recordset);
    });
  });
  app.post('/customers', (req, res) => {
    const { customer_name, customer_phone, customer_point } = req.body;
    if (!customer_name || !customer_phone) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const request = pool.request();
    request.input('customer_name', sql.NVarChar, customer_name)
      .input('customer_phone', sql.NVarChar, customer_phone)
      .input('customer_point', sql.Int, customer_point || null)
      .query('INSERT INTO Customer (customer_name, customer_phone, customer_point) VALUES (@customer_name, @customer_phone, @customer_point)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm khách hàng:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        res.status(201).json({ message: 'Khách hàng đã được thêm thành công' });
      });
  });
  // Cập nhật thông tin khách hàng
  app.put('/customers/:id', (req, res) => {
    const customerId = req.params.id;
    const { customer_name, customer_phone, customer_point } = req.body;

    const request = pool.request();
    request.input('customer_id', sql.Int, customerId);

    let updateQuery = 'UPDATE Customer SET ';
    if (customer_name) {
      updateQuery += 'customer_name = @customer_name, ';
      request.input('customer_name', sql.NVarChar, customer_name);
    }
    if (customer_phone) {
      updateQuery += 'customer_phone = @customer_phone, ';
      request.input('customer_phone', sql.NVarChar, customer_phone);
    }
    if (customer_point) {
      updateQuery += 'customer_point = @customer_point, ';
      request.input('customer_point', sql.Int, customer_point);
    }
    updateQuery = updateQuery.slice(0, -2) + ' WHERE customer_id = @customer_id';
    request.query(updateQuery, (err, result) => {
      if (err) {
        console.log('Lỗi khi cập nhật khách hàng:', err);
        return res.status(500).send('Lỗi hệ thống');  
      }
      res.status(200).json({ message: 'Khách hàng đã được cập nhật thành công' });
    });
  });
  
// thêm điểm cho khách hàng
app.put('/customers/:customer_id/points', (req, res) => {
  const customer_id = parseInt(req.params.customer_id, 10);
  const { customer_point } = req.body;


  if (isNaN(customer_id)) {
    return res.status(400).send('Vui lòng cung cấp ID khách hàng hợp lệ.');
  }

  if (!customer_point || isNaN(customer_point)) {
    return res.status(400).send('Vui lòng cung cấp số điểm hợp lệ để cộng thêm.');
  }

  const request = pool.request();
  request.input('customer_id', sql.Int, customer_id);
  request.input('customer_point', sql.Int, customer_point);

  const updateQuery = `
    UPDATE Customer 
    SET customer_point = ISNULL(customer_point, 0) + @customer_point
    WHERE customer_id = @customer_id
  `;

  request.query(updateQuery, (err, result) => {
    if (err) {
      console.error('Lỗi khi cộng điểm cho khách hàng:', err);
      return res.status(500).json({ message: 'Lỗi hệ thống.', error: err.message });
    }

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng với ID đã cung cấp.' });
    }

    res.status(200).json({
      message: 'Điểm của khách hàng đã được cập nhật thành công.',
      customer_id: customer_id,
      customer_point: customer_point
    });
  });
});

  // Xóa khách hàng
  app.delete('/customers/:id', (req, res) => {
    const customerId = req.params.id;
    const request = pool.request();
    request.input('customer_id', sql.Int, customerId)
      .query('DELETE FROM Customer WHERE customer_id = @customer_id', (err, result) => {
        if (err) {
          console.error('Lỗi khi xóa khách hàng:', err);
          return res.status(500).send('Lỗi hệ thống');
        }
        if (result.rowsAffected[0] === 0) {
          return res.status(404).send('Không tìm thấy khách hàng');
        }
        res.status(200).json({ message: 'Khách hàng đã được xóa thành công' });
      });
  });
  // Trả về thông tin mèo
  app.get('/cats/:catId', (req, res) => {
    const { catId } = req.params

    sql.connect(config).then(pool => {
      return pool.request()
        .input('catId', sql.Int, catId)
        .query('SELECT * FROM Cat WHERE cat_id = @catId');
    }).then(result => {
      if (result.recordset.length === 0) {
        return res.status(404).send('Mèo không tìm thấy');
      }
      const cat = result.recordset[0];
      const catImageBase64 = cat.cat_image ? Buffer.from(cat.cat_image).toString('base64') : null;
      res.status(200).json({
        cat_id: cat.cat_id,
        cat_name: cat.cat_name,
        cat_status: cat.cat_status,
        cat_image: catImageBase64
      });
    }).catch(err => {
      console.log('Lỗi khi truy vấn dữ liệu:', err);
      res.status(500).send('Lỗi hệ thống: ' + err.message);
    });
  });
  app.post('/cats', upload.single('cat_image'), (req, res) => {
    const { cat_name, cat_status} = req.body;
    const cat_image = req.file;
    if (!cat_name || !cat_status || !cat_image ) {
      console.log('cat_name:', cat_name);
      console.log('cat_status:', cat_status);

      console.log('cat_image:', cat_image);
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const catImageBinary = cat_image.buffer;
    const request = pool.request();
    request.input('cat_name', sql.NVarChar, cat_name)
      .input('cat_status', sql.NVarChar, cat_status)

      .input('cat_image', sql.VarBinary, catImageBinary)
      .query('INSERT INTO Cat (cat_name, cat_status,  cat_image) VALUES (@cat_name, @cat_status,  @cat_image)', (err, result) => {
        if (err) {
          console.log('Lỗi khi thêm mèo:', err);
          return res.status(500).send('Lỗi hệ thống: ' + err.message);
        } else {
          res.status(200).json({ message: 'Thêm mèo thành công' });
        }
      });
  });
  //Sửa mèo
  app.put('/cats/:catId', upload.single('cat_image'), (req, res) => {
    const catId = req.params.catId;
    const { cat_name, cat_status } = req.body;
    const cat_image = req.file;
    console.log('catId:', catId);
    console.log('cat_name:', cat_name);
    console.log('cat_status:', cat_status);

    console.log('cat_image:', req.file);
    if (!catId || !cat_name || !cat_status) {
      return res.status(400).send('Vui lòng cung cấp đủ thông tin');
    }
    const catImageBinary = cat_image ? cat_image.buffer : null;
    const request = pool.request();
    request.input('cat_id', sql.Int, catId)
      .input('cat_name', sql.NVarChar, cat_name)
      .input('cat_status', sql.NVarChar, cat_status)

      .input('cat_image', sql.VarBinary, catImageBinary)
      .query('UPDATE Cat SET cat_name = @cat_name, cat_status = @cat_status, cat_image = @cat_image WHERE cat_id = @cat_id', (err, result) => {
        if (err) {
          console.log('Lỗi khi cập nhật mèo:', err);
          return res.status(500).send('Lỗi hệ thống: ' + err.message);
        } else {
          res.status(200).json({ message: 'Cập nhật mèo thành công' });
        }
      });
  });
  // Xóa mèo
  app.delete('/cats/:id', (req, res) => {
    const catId = req.params.id;
    if (!catId) {
      return res.status(400).json({ message: 'ID mèo không hợp lệ' });
    }
    const request = pool.request();
    request.input('cat_id', sql.Int, catId)
      .query('DELETE FROM Cat WHERE cat_id = @cat_id', (err, result) => {
        if (err) {
          console.error('Lỗi khi xóa mèo:', err);
          return res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
          console.log(err);
        }
        if (result.rowsAffected[0] === 0) {
          return res.status(404).json({ message: 'Không tìm thấy mèo với ID này' });
        }
        res.status(200).json({ message: 'Xóa mèo thành công' });
        console.log('Mèo đã được xóa thành công:', catId);
      });
  });
  //Login
  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const request = pool.request();
    request.input('username', sql.NVarChar, username)
      .query('SELECT * FROM User_table WHERE username = @username', (err, result) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
        } else {
          if (result.recordset.length === 0) {
            res.status(401).send('Không tìm thấy người dùng');
            
          } else {
            const user = result.recordset[0];
            if (password === user.password) {
              console.log('userId '+ user.user_id);
              return res.status(200).json({ success: true, message: 'Đăng nhập thành công', role: user.role, id: user.user_id });
              
            }
            else {
              return res.status(401).json({ message: 'Mật khẩu không đúng' });
            }
          }
        }
      });
  });
}).catch(err => {
  console.error('Error connecting to the database:', err);
});
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
function isManager(req, res, next) {
  const role = req.body.role;

  if (role !== 'manager') {
    return res.status(403).json({ message: 'Quyền truy cập bị từ chối: Chỉ dành cho quản lý' });
  }

  next();
}
function isStaff(req, res, next) {
  const role = req.body.role;
  if (role !== 'staff' && role !== 'manager') {
    return res.status(403).json({ message: 'Quyền truy cập bị từ chối: Chỉ dành cho nhân viên' });
  }
  next();
}

