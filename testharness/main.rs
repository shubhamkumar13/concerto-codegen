use std::fs::File;
use std::io::Read;

use helloworld::org_accordproject_helloworld::*;

fn main() -> std::io::Result<()> {
    // Pull the json request object from file.
    let mut file = File::open("./model/request.json")?;
    let mut request_json = String::new();
    file.read_to_string(&mut request_json)?;

    // Let's see what we have.
    println!("request_json = {}", request_json);

    // Deserialise MyRequest
    let request: MyRequest = serde_json::from_str(&request_json).unwrap_or_else(|err| {
        // Ooops!  Didn't work - display an error and exit.
        eprintln!("Error: {}", err);
        std::process::exit(1);
    });

    // Construct output string.
    let output = format!("Hello Fred Blogs {}", &request.input);

    // Create a response object
    let response = MyResponse {
        class: r#"org.accordproject.helloworld.MyResponse"#.to_owned(),
        output,
    };

    // Serialise response
    let response_json = serde_json::to_string(&response).unwrap_or_else(|err| {
        // Ooops!  Didn't work - display an error and exit.
        eprintln!("Error: {}", err);
        std::process::exit(1);
    });

    println!("response_json = {:?}", response_json);

    Ok(())
}
