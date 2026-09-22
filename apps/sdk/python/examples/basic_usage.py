from aeko_sdk import AekoClient


def main() -> None:
    client = AekoClient("https://rpc.aeko.online")
    blockhash = client.get_latest_blockhash()
    print("latest blockhash:", blockhash)


if __name__ == "__main__":
    main()
