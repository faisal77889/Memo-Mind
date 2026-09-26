## learnings 
     the first learing is that fastapi.security is a module which eases your authentication and authorization 
     without that also you can implement the same things

     the seond thing is that if you want to just use the authorization bearer , then you use HTTP Bearer from fastapi.security 

     and you create a security schem by security = HTTPBearer() by doing this the fast api knows that authentication will be done through the authorization header with Bearer

     then when you write get_current_user(credentials : HTTPAutorizationCredentis = Depends(security)) by this line the fast api knows that this is a secure endpoint and httpauthroization credentials are just types which gives you access to the scheme and the credentials which is exactly bearer token


     if you don't want to use this fastapi.security then also you can achieve these things by the following methods : 
        by the Headers which is imported from the fastapi module 
        by the Request whole object ( not sure if that is object literally) which is also from the fastapi module.


        security = HTTPBearer()

class LoginRequest(BaseModel):
    username : str
    password : str

def check_user_in_db(username : str,users : list):
    for user in users:
        if user["username"] == username:
            return user
            break
    return None



def create_access_token(data : dict):
    to_encode = data.copy()
    try:
        access_token = jwt.encode(to_encode,"ABCD",algorithm="HS256")
        return access_token
    except Exception as e:
        raise HTTPException(status_code=400,detail="Something went wrong")

@app.post("/login")
async def login(loginrequest : LoginRequest):
    check_user = check_user_in_db(loginrequest.username,users)

    if not check_user:
        raise HTTPException(status_code=400,detail="User is not found")

    if check_user["password"] != loginrequest.password : 
        raise HTTPException(status_code=401,detail="unauthorized")

    access_token = create_access_token({"sub" : check_user["username"]})
    return access_token


async def get_user_info(credentials : httpauthorizationbeareer  = Depends(security)):
    print("scheme is : ",credentials.scheme)
    try:
        data = jwt.decode(credentials.credentials,"ABCD",algorithms="HS256")
        return data
    except Exception as e:
        raise HTTPException(status_code=400,detail="Some exception occured")

@app.get("/me")
async def get_profile(userInfo : dict = Depends(get_user_info)):
    return userInfo



    

## The second most common way of authentication in the fast api is through oauth schem which is from ouauth2

we have to import from fastapi.security two things , oauth2passwordbearer let's the fast api know that what type of security is used , oauth2bearerrquestform something like that which expects to be a form data for requests


