const {app, admin, emailer, stripe} = require("../../app");
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


app.post("/update-print-order", (req, res) => {

    
    const orderInfo = req.body;
   
    const dbRef = admin.firestore().collection("PrinterServiceInfo").doc("OrderedPrints").collection("Queue")
      .doc(orderInfo.orderId);

    //For their options in reciept.
    orderInfo.confirmedPurchase = false;

    const orderId = orderInfo.orderId;

    //Delete it cause don't need to save as field in database, only needed for 
    delete orderInfo.orderId;

    dbRef.update(
      orderInfo,
    )
    .then (resolution => {
      
        //After it's updated, email the user that ordered it.
        admin.auth().getUser(orderInfo.orderer,)
          .then (user => {

                const userEmail = user.email;
                   
                const link =  "'"+ PRINTING_SERVICE_URL + "/" + orderInfo.orderer + "/orders/"+orderId + "'";

                const mailOptions = {

                    from: process.env.NOTIFIER_EMAIL,
                    to:userEmail,
                    subject:"Your 3DPrint order #" + orderId + " has been updated.",
                    html: "<p> Hello </p> <br> <p> Your order to print your model " + order.name + " has been updated</p>" + 
                    "<p> Click <a href = "+link+">here<a/> to view your order's status" +
                    "<br><br> <p> Best, <br> Cogswell Engineering Society </p>",
                }
                emailer.sendMail(mailOptions)
                    .then( resolved => {

                        console.log("email sent");
                        res.send({success:true});

                        
                    })
                    .catch( err => {

                        console.log("err", err);
                          res.send({error: err});

                    });

          })
          .catch (err =>{

             res.send({error:err});
          })

    })
    .catch( err => {

        console.log(err);

        res.send({error:"Failed to update order information, please try again"});
    })

});


app.post('/charge', async (req, res) => {

    try {

        const body = req.body;

        const {order, stripeToken} = body;

        
        let {status} = await stripe.charges.create({
            amount: order.cost,
            currency: "usd",
            description: "An example charge",
            source: stripeToken.id,
        });

        //After it charges, then send email notification.
        const user = await admin.auth().getUser(order.orderer)

        if (user == null){

            res.json({status});

            //again notify that email wasn't sent. And need to do manuallys
            //JUst logging probably
        }

        const userEmail = user.email;

        const emailOptions = {
            
            from: proccess.env.NOTIFIER_EMAIL,
            to: userEmail,
                    //Should be there, wait no orderId is the key, I removed it from data, I'll re add it upon pulling
                    //for the chargeing page.
            subject: "You have been charged for your print order#"+order.id,
                    //Show it here, I'll start making html template strings 
            html: "<p> Hello,"  + user.displayName +" </p><br>" +
                  "<p>Your ordered print is ready. Come pick up in room 140 at Cogswell College.</p>" + 
                  "<b> Please bring some form of identification </b><br>" +
                  "<p> Best,<br> Cogswell Engineering Society <p> "

            };

        emailer.sendMail(emailOptions)
            .then(val => {
                                    
                console.log("email sent");
                        
                res.json({status});
                    
            })
                    
            .catch(err => {

                        
                console.log(err)
                        //Then log to let officer know need to email manually.
                    
            })

            
           
      
        res.json({status});

    } catch (err) {

      console.log("error thrown", err);
      res.status(500).end();
    }


});
