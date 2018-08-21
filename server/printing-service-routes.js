const {app, admin, emailer} = require("./../app");
const fs = require('fs');
const PRINTING_SERVICE_URL = "http://localhost:3001/"

app.post('/order_print', (req,res) => {


 
    let file = req.files.model;

    
    //Hmm. I'd prefer it to be uid, so it's unique, so maybe I should reverse this to do firestore first, then upload to storage
    //I mean either way cancel if other fails.
    
    let filePath = "ModelTempHold/"+file.name;
    file.mv(filePath);
   //It shouldn't be based on local path, preview does not include current directory.

    //Uploads file into storage in queue
    admin.storage().bucket().upload(filePath,{destination: "3DPrinterQueue/"+file.name+""+body.orderer})
      .then(resolution => {


        const body = req.body;
        const queueRef = admin.firestore().collection("PrinterServiceInfo").doc("OrderedPrints").collection("Queue");
        

        const docRef = queueRef.doc();
        var startTime = "TBD";
        var endTime = "TBD";  
        var duration = "TBD";
        var cost = "TBD";

        docRef.set({
            'name' : file.name,
            'cost' : cost,
            'duration' : duration,
            'color' : body.color,
            'dimensions' : body.dimensions,
            'start' : startTime,
            'end' : endTime,
            'started' : false,
            'orderTime' : new Date(),
            'orderer' : body.orderer,

        })
        .then( result => {
            const orderId = docRef.id;

                admin.auth().getUser(body.orderer)
                .then((user) => {

                    console.log("ordering user", user);
                      //Send id back to there, and to emailer.
                    const linkToOrder = PRINTING_SERVICE_URL + "/" + body.orderer + "/orders/" + orderId
                    const mailOptions = {

                        from: process.env.NOTIFIER_EMAIL,
                        to: user.email, 
                        subject: "CES Printing Service Order Summary(Order#"+orderId+")",
                        html: "<p>Hello, " + user.displayName + "</p><br>" + 
                        "<p>Your order has been processed. We will notify you when information on your print has been updated.</p><br><br>" + 
                        "<p> Click <a href='"+ linkToOrder + "'> here </a> to manage your order </p>" + 
                        "<p> Best, <br> CES </p>",
                    };

                    emailer.sendMail(mailOptions)
                        .then( val => {
                            console.log("email sent");
                        })
                        .catch( err => {

                            console.log("failed to eamil");
                            //Log tha failed and need to manually send the email.
                            //Need to work on making a good logger.
                        })
                })
                .catch( err => {
                    console.log("error",err);
                })
          
            //This can happen before email finally sent, slight delay is fine versus longer load time on order.

            res.send({orderId:docRef.id});
            //Removes the model from temporary.
            fs.unlink(filePath, () => {
               // console.log("removed from temp.");
            });
        })
        .catch(err => {

        })
  

      })
      .catch(err => {
        console.log(err);
      });
});